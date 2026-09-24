"""Start a collection: list input/<collection>/ and reset its graph."""

import re
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.shared import neo4j
from app.shared.config import settings
from app.shared.models import COLLECTION_PATTERN, ID_PATTERN

router = APIRouter()


def list_documents(folder: Path) -> list[dict]:
    """One entry per document id: <id>.json and/or <id>.pdf. Hidden files and
    anything else (CSV lists, fetch scripts) are ignored."""
    docs: dict[str, dict] = {}
    for path in sorted(folder.iterdir()):
        if path.name.startswith(".") or not path.is_file():
            continue
        ext = path.suffix.lower()
        if ext not in (".json", ".pdf") or not re.match(ID_PATTERN, path.stem):
            continue
        doc = docs.setdefault(path.stem, {"id": path.stem, "has_json": False, "has_pdf": False})
        doc["has_json" if ext == ".json" else "has_pdf"] = True
    return list(docs.values())


@router.post("/collections/{collection}/start")
def start(collection: str):
    if not re.match(COLLECTION_PATTERN, collection):
        raise HTTPException(422, f"invalid collection name {collection!r}")
    folder = settings().input_dir / collection
    if not folder.is_dir():
        raise HTTPException(404, f"no input folder {folder}")
    docs = list_documents(folder)
    if not docs:
        raise HTTPException(422, f"{folder} has no .json or .pdf documents")

    # A start is a full re-ingest: drop everything the collection had.
    neo4j.write("MATCH (n {collection: $c}) DETACH DELETE n", c=collection)
    neo4j.write(
        """
        MERGE (c:Collection {uid: $c})
        SET c.name = $c, c.collection = $c, c.status = 'processing',
            c.expected = $n, c.done = 0, c.failed = 0, c.arg_counter = 0,
            c.started_at = datetime()
        """,
        c=collection, n=len(docs))
    return {"collection": collection, "expected": len(docs),
            "documents": [{"collection": collection, "id": d["id"]} for d in docs]}
