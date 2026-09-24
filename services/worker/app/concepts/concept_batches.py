"""Batches of in-graph arguments for the concept constructor, rendered exactly
as the old pipeline built its prompt: merge_all_arguments() wrote one
"Argument: <text>" line per argument to a file, concept_constructor() read the
non-empty stripped lines back, chunked them by 15 and formatted each chunk (a
Python list) into the prompt."""

from fastapi import APIRouter, HTTPException

from app.concepts.common import check_collection
from app.shared import neo4j

router = APIRouter()

BATCH_SIZE = 15


def argument_lines(texts: list[str]) -> list[str]:
    """Write-then-read of argument_all_corpus.txt: an argument containing a
    newline becomes several lines, as it did in the old file."""
    content = "".join(f"Argument: {t}\n" for t in texts)
    content = content.replace("\r\n", "\n").replace("\r", "\n")
    return [line.strip() for line in content.split("\n") if line.strip()]


def batches(lines: list[str], size: int = BATCH_SIZE) -> list[str]:
    return [str(lines[i:i + size]) for i in range(0, len(lines), size)]


@router.get("/collections/{collection}/concept-batches")
def concept_batches(collection: str):
    check_collection(collection)
    rows = neo4j.read(
        """
        MATCH (a:Argument {collection: $c, in_graph: true})
        RETURN a.full_argument AS text ORDER BY a.document_id, a.local_id
        """,
        c=collection)
    if not rows:
        raise HTTPException(422, f"collection {collection} has no in-graph arguments")
    out = batches(argument_lines([r["text"] for r in rows]))
    return {"collection": collection, "arguments": len(rows),
            "batches": [{"list_of_args": b} for b in out]}
