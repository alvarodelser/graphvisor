"""Mark a collection ready for GraphVisor."""

from fastapi import APIRouter
from pydantic import BaseModel

from app.enrichment.common import check_collection
from app.shared import events, neo4j

router = APIRouter()


@router.post("/collections/{collection}/ready")
def ready(collection: str):
    check_collection(collection)
    neo4j.write("MATCH (c:Collection {uid: $c}) SET c.status = 'ready', c.finished_at = datetime()",
                c=collection)
    events.collection_stage(collection, "ready")
    return {"collection": collection, "status": "ready"}


class FinalizeFailedIn(BaseModel):
    step: str
    error: str = ""


@router.post("/collections/{collection}/finalize-failed")
def finalize_failed(collection: str, body: FinalizeFailedIn):
    check_collection(collection)
    neo4j.write("MATCH (c:Collection {uid: $c}) SET c.status = 'failed', c.failed_step = $s, c.error = $e",
                c=collection, s=body.step, e=body.error[:2000])
    events.collection_stage(collection, "failed", failed_step=body.step)
    return {"collection": collection, "status": "failed", "step": body.step}
