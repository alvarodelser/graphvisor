"""OpenAlex works API (from preprocessing/openalex_client.py), plus DOI lookup."""

from __future__ import annotations

import time
import urllib.parse

import httpx

from app.shared.citation_http import compute_retry_delay
from app.shared.config import settings

WORKS_URL = "https://api.openalex.org/works"
FIELDS = "display_name,cited_by_count,publication_year,doi"


class OpenAlexError(RuntimeError):
    pass


def sanitize_query(title: str) -> str:
    """Strip characters OpenAlex treats as filter syntax (',' and '|')."""
    cleaned = (title or "").replace(",", " ").replace("|", " ")
    return " ".join(cleaned.split())


def _get(url: str, params: dict) -> httpx.Response | None:
    """GET with the shared rate limit and retry policy; None on 404."""
    s = settings()
    params = {**params, "mailto": s.openalex_mailto} if s.openalex_mailto else params
    with httpx.Client(timeout=30.0) as client:
        for attempt in range(s.citation_max_retries):
            time.sleep(s.citation_rate_limit_s)
            try:
                response = client.get(url, params=params)
            except httpx.HTTPError as exc:
                if attempt == s.citation_max_retries - 1:
                    raise OpenAlexError(f"OpenAlex request failed: {exc}") from exc
                time.sleep(s.citation_rate_limit_s * (2 ** attempt))
                continue
            if response.status_code == 429:
                if attempt == s.citation_max_retries - 1:
                    raise OpenAlexError("OpenAlex rate limit (429) not cleared")
                time.sleep(compute_retry_delay(response, attempt=attempt, base=s.citation_rate_limit_s))
                continue
            if response.status_code == 404:
                return None
            try:
                response.raise_for_status()
            except httpx.HTTPError as exc:
                raise OpenAlexError(f"OpenAlex returned an error: {exc}") from exc
            return response
    return None


def search_paper(title: str, per_page: int = 5) -> list[dict]:
    """Works whose title matches, each with display_name, cited_by_count,
    publication_year and doi."""
    response = _get(WORKS_URL, {"filter": f"title.search:{sanitize_query(title)}",
                                "select": FIELDS, "per-page": str(per_page)})
    return (response.json().get("results") or []) if response is not None else []


def get_by_doi(doi: str) -> dict | None:
    """The work with this DOI, or None."""
    doi = doi.strip().removeprefix("https://doi.org/")
    response = _get(f"{WORKS_URL}/doi:{urllib.parse.quote(doi, safe='/')}", {"select": FIELDS})
    return response.json() if response is not None else None
