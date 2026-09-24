"""Store argument classification (one LLM response per argument) and return
the arguments L2 runs on: those whose primary_type is one of the six graph
types of the old entity_constructor()."""

import logging

from fastapi import APIRouter
from pydantic import BaseModel

from app.shared import llm_json, neo4j
from app.shared.documents import require_document
from app.shared.models import DocRef

router = APIRouter()
logger = logging.getLogger(__name__)

GRAPH_TYPES = {"causal", "mechanistic", "evidence", "contradiction", "analogy", "correlational"}


class ClassificationItem(BaseModel):
    local_id: int
    raw: str


class ClassificationIn(DocRef):
    results: list[ClassificationItem]


def parse_classification(raw: str) -> dict:
    data = llm_json.loads(raw)
    if not isinstance(data, dict):
        raise llm_json.LLMJSONError("classification is not an object")
    # The old code compared primary_type verbatim; case/whitespace are
    # normalized so a capitalized answer isn't silently dropped from the graph.
    primary = str(data.get("primary_type") or "").strip().lower()
    return {
        "primary_type": primary,
        "secondary_types": [str(t) for t in data.get("secondary_types") or []],
        "epistemic_strength": data.get("epistemic_strength"),
        "confidence": data.get("confidence"),
        "reasoning": data.get("reasoning"),
    }


@router.post("/documents/classification")
def save_classification(body: ClassificationIn):
    require_document(body.collection, body.id)
    rows, skipped = [], []
    for item in body.results:
        try:
            rows.append({"local_id": item.local_id, **parse_classification(item.raw)})
        except llm_json.LLMJSONError as exc:
            logger.error("classification of %s/%s arg %s: %s",
                         body.collection, body.id, item.local_id, exc)
            skipped.append(item.local_id)

    saved = neo4j.write(
        """
        UNWIND $rows AS row
        MATCH (a:Argument {uid: $doc_uid + ':' + row.local_id})
        SET a.argument_type = row.primary_type, a.secondary_types = row.secondary_types,
            a.epistemic_strength = row.epistemic_strength,
            a.confidence = row.confidence, a.reasoning = row.reasoning
        RETURN a.local_id AS local_id, a.full_argument AS text, a.argument_type AS type
        ORDER BY a.local_id
        """,
        doc_uid=neo4j.uid(body.collection, body.id), rows=rows)
    graph_args = [{"ARG_ID": r["local_id"], "FULL_ARGUMENT": r["text"]}
                  for r in saved if r["type"] in GRAPH_TYPES]
    return {"collection": body.collection, "id": body.id, "skipped": skipped,
            "graph_arguments": graph_args}
