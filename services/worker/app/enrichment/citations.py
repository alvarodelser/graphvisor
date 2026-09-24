"""Citation counts (from preprocessing/enrich_citations.py): OpenAlex by DOI
when the input had one, else OpenAlex then Semantic Scholar by title."""

import logging

from fastapi import APIRouter

from app.enrichment.common import best_match, check_collection
from app.shared import events, neo4j, openalex, semanticscholar

router = APIRouter()
logger = logging.getLogger(__name__)


def lookup(title: str, doi: str | None) -> tuple[int | None, str | None]:
    if doi:
        try:
            work = openalex.get_by_doi(doi)
            if work and work.get("cited_by_count") is not None:
                return int(work["cited_by_count"]), "openalex_doi"
        except openalex.OpenAlexError as exc:
            logger.warning("OpenAlex DOI lookup %s: %s", doi, exc)
    if not title:
        return None, None
    try:
        match = best_match(title, openalex.search_paper(title), "display_name")
        if match and match.get("cited_by_count") is not None:
            return int(match["cited_by_count"]), "openalex"
    except openalex.OpenAlexError as exc:
        logger.warning("OpenAlex title lookup: %s", exc)
    try:
        match = best_match(title, semanticscholar.search_paper(title), "title")
        if match and match.get("citationCount") is not None:
            return int(match["citationCount"]), "s2"
    except semanticscholar.S2Error as exc:
        logger.warning("Semantic Scholar lookup: %s", exc)
    return None, None


@router.post("/collections/{collection}/citations")
def citations(collection: str):
    check_collection(collection)
    events.collection_stage(collection, "citations")
    docs = neo4j.read("MATCH (d:Document {collection: $c, status: 'done'}) WHERE d.citations IS NULL "
                      "RETURN d.uid AS uid, d.title AS title, d.doi AS doi ORDER BY d.id", c=collection)
    found, missing = 0, []
    for d in docs:
        count, source = lookup(d["title"], d["doi"])
        if count is None:
            missing.append(d["uid"])
            continue
        neo4j.write("MATCH (d:Document {uid: $uid}) SET d.citations = $n, d.citations_source = $s",
                    uid=d["uid"], n=count, s=source)
        found += 1
    return {"collection": collection, "looked_up": len(docs), "found": found, "missing": missing}
