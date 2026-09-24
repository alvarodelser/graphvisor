"""Close a document (done or failed) and report whether the whole collection
is finished, which is n8n's cue to run graphvisor_finalize."""

from fastapi import APIRouter

from app.shared import neo4j
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
        RETURN c.done AS done, c.failed AS failed, c.expected AS expected
        """,
        c=ref.collection, uid=neo4j.uid(ref.collection, ref.id), id=ref.id,
        status=status, step=step, error=error)[0]
    out = {"collection": ref.collection, "id": ref.id, **row,
           "collection_complete": row["done"] + row["failed"] >= row["expected"]}
    if status == "failed":
        out.update(step=step, error=error)  # the DLQ message is this response
    return out


@router.post("/documents/done")
def done(ref: DocRef):
    return _close(ref, "done")


@router.post("/documents/failed")
def failed(body: FailedIn):
    return _close(body, "failed", body.step, body.error[:2000])
