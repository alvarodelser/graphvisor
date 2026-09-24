"""Document vectors for GraphVisor's map (preprocessing/embed.py): title + abstract."""

from fastapi import APIRouter

from app.enrichment.common import check_collection
from app.shared import neo4j, vectorizer

router = APIRouter()


def document_text(title: str | None, abstract: str | None, year) -> str:
    parts = [p for p in ((title or "").strip(), (abstract or "").strip()) if p]
    if not parts:
        return f"Untitled document ({year})" if year else "Untitled document"
    return "\n".join(parts)


@router.post("/collections/{collection}/doc-embeddings")
def doc_embedding(collection: str):
    check_collection(collection)
    docs = neo4j.read("MATCH (d:Document {collection: $c, status: 'done'}) RETURN d.uid AS uid, "
                      "d.title AS title, d.abstract AS abstract, d.year AS year ORDER BY d.id", c=collection)
    vectors = vectorizer.embed_or_502([document_text(d["title"], d["abstract"], d["year"]) for d in docs])
    neo4j.write("UNWIND $rows AS row MATCH (d:Document {uid: row.uid}) SET d.embedding = row.v",
                rows=[{"uid": d["uid"], "v": v} for d, v in zip(docs, vectors)])
    return {"collection": collection, "embedded": len(docs)}
