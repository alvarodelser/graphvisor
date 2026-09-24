"""Helpers shared by the enrichment steps."""

from difflib import SequenceMatcher

from app.concepts.common import check_collection  # noqa: F401 (re-exported)
from app.shared.config import settings


def _normalize(text: str) -> str:
    return " ".join((text or "").lower().split())


def best_match(query_title: str, candidates: list[dict], title_key: str) -> dict | None:
    """Most similar candidate title at or above the match threshold
    (from preprocessing/enrich_citations.py)."""
    query_norm = _normalize(query_title)
    best, best_score = None, 0.0
    for candidate in candidates:
        title = candidate.get(title_key)
        if not title:
            continue
        score = SequenceMatcher(None, query_norm, _normalize(title)).ratio()
        if score >= settings().citation_match_threshold and score > best_score:
            best, best_score = candidate, score
    return best
