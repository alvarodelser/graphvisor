"""Close a document (done or failed) and report whether the whole collection
is finished, which is n8n's cue to run graphvisor_finalize.

Finalize runs only when every document is done. When the last one closes with
some failed, the collection becomes `incomplete` and waits: the failed ones are
retried, or accepted as lost (services/collection.sh, app/ingest/retry.py)."""

from fastapi import APIRouter

from app.shared import events, neo4j
from app.shared.models import DocRef

router = APIRouter()


class FailedIn(DocRef):
    step: str
    error: str = ""


def _close(ref: DocRef, status: str, step: str = None, error: str = None) -> dict:
    # Counters move only on a status change, so a redelivered message can't
    # double-count; a failed document that later succeeds moves from failed to done.
    row = neo4j.write(
        """
        MATCH (c:Collection {uid: $c})
        MERGE (d:Document {uid: $uid})
          ON CREATE SET d.collection = $c, d.id = $id
        MERGE (c)-[:CONTAINS]->(d)
        WITH c, d, coalesce(d.status, '') AS before
        SET d.status = $status, d.failed_step = $step, d.error = $error
        SET c.done = c.done + CASE WHEN $status = 'done' AND before <> 'done' THEN 1
                                   WHEN $status <> 'done' AND before = 'done' THEN -1 ELSE 0 END,
            c.failed = c.failed + CASE WHEN $status = 'failed' AND before <> 'failed' THEN 1
                                       WHEN $status <> 'failed' AND before = 'failed' THEN -1 ELSE 0 END
        RETURN c.done AS done, c.failed AS failed, c.expected AS expected,
               coalesce(c.accept_failures, false) AS accept_failures
        """,
        c=ref.collection, uid=neo4j.uid(ref.collection, ref.id), id=ref.id,
        status=status, step=step, error=error)[0]
    closed, complete = completion(row)
    out = {"collection": ref.collection, "id": ref.id, "done": row["done"], "failed": row["failed"],
           "expected": row["expected"], "collection_complete": complete}
    _emit_document_event(ref, status, step, error)
    events.stage(ref.collection, ref.id, status, failed_step=step)
    if closed and not complete:
        events.collection_stage(ref.collection, "incomplete", failed=row["failed"])
    if status == "failed":
        out.update(step=step, error=error)  # the DLQ message is this response
    return out


def completion(row: dict) -> tuple[bool, bool]:
    """(every document closed, ready to finalize). Queued and processing
    documents count as neither done nor failed, so a retry holds finalize back."""
    closed = row["done"] + row["failed"] >= row["expected"]
    return closed, closed and (row["failed"] == 0 or row["accept_failures"])


def _emit_document_event(ref: DocRef, status: str, step: str | None, error: str | None) -> None:
    """document_done / document_failed for the dashboard: time per stage and sizes."""
    rows = neo4j.read(
        """
        MATCH (d:Document {uid: $uid})
        CALL (d) { OPTIONAL MATCH (d)-[:HAS_CHUNK]->(c) RETURN count(c) AS chunks }
        CALL (d) { OPTIONAL MATCH (d)-[:HAS_ARGUMENT]->(a) RETURN count(a) AS arguments,
                   sum(CASE WHEN a.in_graph THEN 1 ELSE 0 END) AS graph_arguments }
        CALL (d) { OPTIONAL MATCH (d)-[:HAS_ARGUMENT]->()-[:HAS_SUBJECT|HAS_OBJECT]->(e)
                   RETURN count(DISTINCT e) AS entities }
        RETURN d {.source, .loaded_at, .chunked_at, .abstract_at, .l1_at, .classified_at, .l2_at} AS d,
               chunks, arguments, graph_arguments, entities, timestamp() AS now
        """,
        uid=neo4j.uid(ref.collection, ref.id))
    if not rows:
        return
    r = rows[0]
    events.emit("document_done" if status == "done" else "document_failed",
                level="info" if status == "done" else "error",
                collection=ref.collection, doc_id=f"{ref.collection}:{ref.id}", source=r["d"]["source"],
                failed_step=step, error=error, chunks=r["chunks"], arguments=r["arguments"],
                graph_arguments=r["graph_arguments"], entities=r["entities"],
                **events.stage_seconds(r["d"], r["now"]))


@router.post("/documents/done")
def done(ref: DocRef):
    return _close(ref, "done")


@router.post("/documents/failed")
def failed(body: FailedIn):
    return _close(body, "failed", body.step, body.error[:2000])
