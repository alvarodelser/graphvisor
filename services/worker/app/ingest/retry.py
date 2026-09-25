"""Failed documents of a collection: list them, queue them again, or accept
them as lost so the collection can finalize without them.

services/collection.sh drives these (status / retry / finalize). Retrying
marks the documents `queued`: they no longer count as failed, so finalize
can't start before they've run again. Accepting is for documents that will
never work (a broken PDF): finalize then goes ahead with the rest."""

import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.ingest.done import completion
from app.shared import events, neo4j
from app.shared.models import ID_PATTERN

router = APIRouter(tags=["ingest"])


def _collection(collection: str) -> dict:
    rows = neo4j.read(
        "MATCH (c:Collection {uid: $c}) RETURN c.status AS status, c.expected AS expected, c.done AS done, "
        "c.failed AS failed, coalesce(c.accept_failures, false) AS accept_failures, c.stage AS stage",
        c=collection)
    if not rows:
        raise HTTPException(404, f"no collection {collection}")
    return rows[0]


@router.get("/collections/{collection}/failures")
def failures(collection: str):
    c = _collection(collection)
    counts = {r["status"]: r["n"] for r in neo4j.read(
        "MATCH (:Collection {uid: $c})-[:CONTAINS]->(d:Document) RETURN d.status AS status, count(*) AS n",
        c=collection)}
    failed = neo4j.read(
        "MATCH (:Collection {uid: $c})-[:CONTAINS]->(d:Document {status: 'failed'}) "
        "RETURN d.id AS id, d.source AS source, d.failed_step AS step, left(d.error, 300) AS error ORDER BY d.id",
        c=collection)
    return {"collection": collection, **c, "documents": counts, "failures": failed}


class RetryIn(BaseModel):
    ids: list[str] = Field(default_factory=list)   # empty: every failed document


@router.post("/collections/{collection}/retry")
def retry(collection: str, body: RetryIn):
    """Mark failed documents `queued` and return the messages to publish on
    graphvisor_ingest. Only failed documents can be retried."""
    c = _collection(collection)
    if c["status"] in ("finalizing",):
        raise HTTPException(409, f"{collection} is finalizing: wait for it to finish")
    bad = [i for i in body.ids if not re.match(ID_PATTERN, i)]
    if bad:
        raise HTTPException(422, f"invalid document ids: {bad}")
    rows = neo4j.write(
        """
        MATCH (c:Collection {uid: $c})-[:CONTAINS]->(d:Document {status: 'failed'})
        WHERE size($ids) = 0 OR d.id IN $ids
        SET d.status = 'queued', c.failed = c.failed - 1
        RETURN d.id AS id ORDER BY id
        """,
        c=collection, ids=body.ids)
    ids = [r["id"] for r in rows]
    missing = sorted(set(body.ids) - set(ids))
    if ids:
        # Retrying lifts an earlier "finalize without them". A ready collection
        # stays browsable until the retried documents are done and finalize reruns.
        neo4j.write("MATCH (c:Collection {uid: $c}) SET c.accept_failures = false, "
                    "c.status = CASE WHEN c.status IN ['incomplete', 'failed'] THEN 'processing' "
                    "ELSE c.status END", c=collection)
        events.emit("collection_retry", collection=collection, documents=len(ids), ids=ids)
    return {"collection": collection, "queued": ids, "not_failed": missing,
            "messages": [{"collection": collection, "id": i} for i in ids]}


@router.post("/collections/{collection}/accept-failures")
def accept_failures(collection: str):
    """Finalize without the documents that failed. Documents still queued or
    processing aren't affected: finalize waits for them either way."""
    c = _collection(collection)
    neo4j.write("MATCH (c:Collection {uid: $c}) SET c.accept_failures = true", c=collection)
    events.emit("collection_accept_failures", collection=collection, failed=c["failed"])
    return {"collection": collection, "accepted_failures": c["failed"]}


@router.post("/collections/{collection}/finalize-request")
def finalize_request(collection: str):
    """Called by graphvisor_ingest for a {collection, action: finalize}
    message: finalize now if the collection is ready for it."""
    c = _collection(collection)
    closed, complete = completion(c)
    reason = None
    if c["status"] in ("finalizing", "ready"):
        complete, reason = False, f"already {c['status']}"
    elif not closed:
        reason = f"{c['expected'] - c['done'] - c['failed']} documents still queued or processing"
    elif not complete:
        reason = f"{c['failed']} failed documents: retry them or accept the failures"
    events.emit("finalize_request", level="info" if complete else "warning", collection=collection,
                accepted=complete, reason=reason)
    return {"collection": collection, "collection_complete": complete, "reason": reason}
