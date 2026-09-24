"""Embed the validated concepts (old concept_indexing(): Elasticsearch
dense_vector; here Concept.embedding in Neo4j's vector index)."""

from fastapi import APIRouter, HTTPException

from app.concepts.common import check_collection
from app.shared import neo4j, vectorizer

router = APIRouter()


def concept_text(name: str, description: str) -> str:
    # Old text: " passage: concept: {concept} description: {description}";
    # the "passage:" prefix was e5's and BGE-M3 has none.
    return f"concept: {name} description: {description}"


@router.post("/collections/{collection}/concepts/index")
def concept_indexing(collection: str):
    check_collection(collection)
    rows = neo4j.read("MATCH (n:Concept {collection: $c}) RETURN n.uid AS uid, n.name AS name, "
                      "n.description AS description ORDER BY n.concept_id", c=collection)
    if not rows:
        raise HTTPException(422, f"collection {collection} has no concepts")
    vectors = vectorizer.embed_or_502([concept_text(r["name"], r["description"] or "") for r in rows])
    neo4j.write("UNWIND $rows AS row MATCH (n:Concept {uid: row.uid}) SET n.embedding = row.v",
                rows=[{"uid": r["uid"], "v": v} for r, v in zip(rows, vectors)])
    return {"collection": collection, "indexed": len(rows)}
