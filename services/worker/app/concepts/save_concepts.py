"""Store the validated concept list, replacing the collection's concepts.

An unparsable answer is reported as {"valid": false} (not an HTTP error) so
the finalize workflow can ask the LLM again, like the L2 retry loop."""

from fastapi import APIRouter
from pydantic import BaseModel

from app.concepts.common import check_collection
from app.shared import events, llm_json, neo4j

router = APIRouter()


class ConceptsIn(BaseModel):
    raw: str


def parse_concepts(raw: str) -> list[dict]:
    data = llm_json.loads(raw)
    # The prompt asks for a JSON array; an object wrapping one list is accepted too.
    if isinstance(data, dict) and len(data) == 1 and isinstance(next(iter(data.values())), list):
        data = next(iter(data.values()))
    if not isinstance(data, list):
        raise llm_json.LLMJSONError("validated concepts are not a JSON array")
    concepts, seen = [], set()
    for item in data:
        name = str(item.get("concept") or "").strip() if isinstance(item, dict) else ""
        if not name or name in seen:
            continue
        seen.add(name)
        concepts.append({"name": name, "description": item.get("description"),
                         "epistemic_strength": item.get("epistemic_strength"),
                         "confidence": item.get("confidence")})
    if not concepts:
        raise llm_json.LLMJSONError("no concepts in the validated list")
    return concepts


@router.post("/collections/{collection}/concepts")
def save_concepts(collection: str, body: ConceptsIn):
    check_collection(collection)
    try:
        concepts = parse_concepts(body.raw)
    except llm_json.LLMJSONError as exc:
        return {"collection": collection, "valid": False, "error": str(exc)}
    neo4j.write("MATCH (n:Concept {collection: $c}) DETACH DELETE n", c=collection)
    neo4j.write(
        """
        UNWIND range(0, size($concepts) - 1) AS i
        WITH i, $concepts[i] AS c
        CREATE (:Concept {uid: $col + ':' + c.name, collection: $col, concept_id: i + 1,
                          name: c.name, description: c.description,
                          epistemic_strength: c.epistemic_strength, confidence: c.confidence})
        """,
        col=collection, concepts=concepts)
    events.collection_stage(collection, "linking", concepts=len(concepts))
    return {"collection": collection, "valid": True, "concepts": len(concepts)}
