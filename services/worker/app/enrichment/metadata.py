"""Title/year for documents whose input didn't carry them (PDF-only):
filename (the old extract_info), then OpenAlex, then the LLM."""

import logging
import re

from fastapi import APIRouter
from pydantic import BaseModel

from app.enrichment.common import best_match, check_collection
from app.shared import events, llm_json, neo4j, openalex
from app.shared.models import DocRef

router = APIRouter()
logger = logging.getLogger(__name__)

LLM_TEXT_CHARS = 4000


def extract_info(stem: str) -> tuple[str, int | None]:
    """Old utils.json_operations.extract_info: '<title>-<year>' file names."""
    match = re.search(r"-(\d{4})$", stem)
    if match:
        return stem[:match.start()].strip(), int(match.group(1))
    return stem.strip(), None


class MetadataIn(DocRef):
    raw: str


@router.post("/collections/{collection}/metadata")
def metadata(collection: str):
    check_collection(collection)
    events.collection_stage(collection, "metadata")
    docs = neo4j.read(
        """
        MATCH (d:Document {collection: $c, status: 'done'})
        WHERE d.title IS NULL OR d.year IS NULL
        OPTIONAL MATCH (d)-[:HAS_CHUNK]->(ch:Chunk)
        WITH d, ch ORDER BY ch.index
        RETURN d.uid AS uid, d.id AS id, d.title AS title, d.year AS year,
               collect(ch.text)[0..2] AS first_chunks
        """,
        c=collection)
    pending = []
    for d in docs:
        title, year = d["title"], d["year"]
        if not title:
            title, name_year = extract_info(d["id"])
            year = year or name_year
        doi = None
        try:
            match = best_match(title, openalex.search_paper(title), "display_name")
        except openalex.OpenAlexError as exc:
            logger.warning("OpenAlex metadata lookup for %s: %s", d["uid"], exc)
            match = None
        if match:
            title = match["display_name"]
            year = year or match.get("publication_year")
            doi = match.get("doi")
        neo4j.write("MATCH (d:Document {uid: $uid}) SET d.title = $title, d.year = $year, "
                    "d.doi = coalesce(d.doi, $doi)", uid=d["uid"], title=title, year=year, doi=doi)
        if not match:
            pending.append({"collection": collection, "id": d["id"],
                            "text": "\n\n".join(d["first_chunks"])[:LLM_TEXT_CHARS]})
    return {"collection": collection, "checked": len(docs), "needs_llm": pending}


@router.post("/documents/metadata")
def save_metadata(body: MetadataIn):
    """LLM answer {"title": ..., "year": ...}; kept only where it's usable."""
    try:
        data = llm_json.loads(body.raw)
    except llm_json.LLMJSONError as exc:
        return {"collection": body.collection, "id": body.id, "valid": False, "error": str(exc)}
    title = str(data.get("title") or "").strip() if isinstance(data, dict) else ""
    year = data.get("year") if isinstance(data, dict) else None
    year = int(year) if str(year or "").isdigit() and len(str(year)) == 4 else None
    neo4j.write("MATCH (d:Document {uid: $uid}) SET d.title = coalesce($title, d.title), "
                "d.year = coalesce(d.year, $year)",
                uid=neo4j.uid(body.collection, body.id), title=title or None, year=year)
    return {"collection": body.collection, "id": body.id, "valid": True}
