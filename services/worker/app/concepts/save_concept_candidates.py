"""Collect the concept constructor's answers (one per batch) into the text the
old concept_validation() read from all_concepts.txt."""

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.concepts.common import check_collection
from app.shared import events, llm_json

router = APIRouter()
logger = logging.getLogger(__name__)


class CandidatesIn(BaseModel):
    responses: list[str]


def candidates_text(responses: list[str]) -> tuple[str, int]:
    """Same lines as the old writer. As there, a malformed item ends that
    response's contribution (the old try wrapped each response's loop)."""
    out, skipped = [], 0
    for raw in responses:
        try:
            data = llm_json.loads(raw)
            for item in data["concepts"]:
                out.append(f"concept: {item['concept']}: \n description:{item['description']}\n")
        except (llm_json.LLMJSONError, KeyError, TypeError) as exc:
            logger.error("concept constructor response skipped: %s", exc)
            skipped += 1
    return "".join(out), skipped


@router.post("/collections/{collection}/concept-candidates")
def save_concept_candidates(collection: str, body: CandidatesIn):
    check_collection(collection)
    text, skipped = candidates_text(body.responses)
    if not text:
        raise HTTPException(422, "no concept in any constructor response")
    events.collection_stage(collection, "concept_validation", skipped_responses=skipped)
    return {"collection": collection, "skipped_responses": skipped, "list_of_concepts": text}
