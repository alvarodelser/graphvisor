"""Hypothesis seeds: for each concept, the arguments linked to it, in batches
of 200, written exactly as the old pipeline's neo4j_arg_extraction_by_concept()
wrote its per-concept files (which hypothesis_generation.py then fed to the
prompt as {arg_list})."""

from fastapi import APIRouter, HTTPException

from app.concepts.common import check_collection
from app.shared import events, neo4j

router = APIRouter()

BATCH_SIZE = 200


def render_batch(concept: str, arguments: list[dict]) -> str:
    """The old file format: header, then ARGUMENT_ID / ARGUMENT blocks."""
    out = [f"### CONCEPT: {concept}\n", f"### NUM_ARGUMENTS: {len(arguments)}\n\n"]
    for a in arguments:
        out.append(f"ARGUMENT_ID: {a['id']}\n")
        out.append(f"ARGUMENT:\n{a['text']}\n\n")
    return "".join(out)


def seeds_for(concepts: list[dict], size: int = BATCH_SIZE) -> list[dict]:
    seeds = []
    for c in concepts:
        args = c["arguments"]
        for start in range(0, len(args), size):
            seeds.append({"concept": c["concept"], "batch": start,
                          "arg_list": render_batch(c["concept"], args[start:start + size])})
    return seeds


@router.get("/collections/{collection}/hypothesis-seeds")
def hypothesis_seeds(collection: str):
    check_collection(collection)
    concepts = neo4j.read(
        """
        MATCH (c:Concept {collection: $c})<-[:HAS_CONCEPT]-(a:Argument {collection: $c})
        WITH c, a ORDER BY a.document_id, a.local_id
        RETURN c.name AS concept, collect(DISTINCT {id: a.argument_id, text: a.full_argument}) AS arguments
        ORDER BY concept
        """,
        c=collection)
    if not concepts:
        raise HTTPException(422, f"collection {collection} has no linked concepts")
    # A new run replaces the previous hypotheses.
    neo4j.write("MATCH (h:Hypothesis {collection: $c}) DETACH DELETE h", c=collection)
    seeds = seeds_for(concepts)
    events.collection_stage(collection, "hypotheses", concepts=len(concepts), batches=len(seeds))
    return {"collection": collection, "seeds": seeds}
