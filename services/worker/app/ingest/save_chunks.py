"""Store the chunker's output. Chunks titled "abstract"/"summary" become the
document's abstract, as in the old pipeline's get_chunks()."""

from typing import Optional

from fastapi import APIRouter, HTTPException

from app.shared import neo4j
from app.shared.documents import require_document
from app.shared.models import DocRef

router = APIRouter()

ABSTRACT_TITLES = ("summary", "abstract")


class ChunksIn(DocRef):
    content_parsed: str
    chunk_list: list[str]
    chunk_title: Optional[list[str]] = None


def split_abstract(chunks: list[str], titles: list[str]) -> tuple[str, list[str], list[str]]:
    """Port of the old get_chunks(): join the abstract/summary chunks into the
    abstract and remove them (in reverse order) from the chunk list."""
    chunks, titles = list(chunks), list(titles)
    indexes = [i for i, t in enumerate(titles) if (t or "").strip().lower() in ABSTRACT_TITLES]
    abstract = " ".join(chunks[i] for i in indexes)
    for i in sorted(indexes, reverse=True):
        del chunks[i]
        del titles[i]
    return abstract, chunks, titles


@router.post("/documents/chunks")
def save_chunks(body: ChunksIn):
    if not body.chunk_list:
        raise HTTPException(422, "chunker returned no chunks")
    titles = body.chunk_title or [""] * len(body.chunk_list)
    if len(titles) != len(body.chunk_list):
        raise HTTPException(422, "chunk_title and chunk_list differ in length")

    doc = require_document(body.collection, body.id)
    found_abstract, chunks, titles = split_abstract(body.chunk_list, titles)
    if not chunks:
        raise HTTPException(422, "only abstract chunks, nothing to extract arguments from")
    abstract = doc.get("abstract") or found_abstract or None

    uid = neo4j.uid(body.collection, body.id)
    neo4j.write(
        """
        MATCH (d:Document {uid: $uid})
        SET d.text = $text, d.abstract = $abstract
        WITH d
        OPTIONAL MATCH (d)-[:HAS_CHUNK]->(old:Chunk)
        DETACH DELETE old
        WITH DISTINCT d
        UNWIND range(0, size($chunks) - 1) AS i
        CREATE (d)-[:HAS_CHUNK]->(:Chunk {uid: $uid + ':' + i, collection: $c,
                                          index: i, title: $titles[i], text: $chunks[i]})
        """,
        uid=uid, c=body.collection, text=body.content_parsed, abstract=abstract,
        chunks=chunks, titles=titles)
    return {"collection": body.collection, "id": body.id,
            "needs_abstract": abstract is None,
            "chunk_list": chunks, "chunk_title": titles,
            "chunks": [{"input_text": c} for c in chunks]}
