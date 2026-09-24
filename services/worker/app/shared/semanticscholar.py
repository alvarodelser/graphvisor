"""Semantic Scholar paper search (from preprocessing/semanticscholar_client.py)."""

from __future__ import annotations

import time

import httpx

from app.shared.citation_http import compute_retry_delay
from app.shared.config import settings

SEARCH_URL = "https://api.semanticscholar.org/graph/v1/paper/search"


class S2Error(RuntimeError):
    pass


def search_paper(title: str, limit: int = 5) -> list[dict]:
    """Candidates with at least title and citationCount; [] when none."""
    s = settings()
    params = {"query": title, "fields": "title,citationCount", "limit": str(limit)}
    with httpx.Client(timeout=30.0) as client:
        for attempt in range(s.citation_max_retries):
            time.sleep(s.citation_rate_limit_s)
            try:
                response = client.get(SEARCH_URL, params=params)
            except httpx.HTTPError as exc:
                if attempt == s.citation_max_retries - 1:
                    raise S2Error(f"Semantic Scholar request failed: {exc}") from exc
                time.sleep(s.citation_rate_limit_s * (2 ** attempt))
                continue
            if response.status_code == 429:
                if attempt == s.citation_max_retries - 1:
                    raise S2Error("Semantic Scholar rate limit (429) not cleared")
                time.sleep(compute_retry_delay(response, attempt=attempt, base=s.citation_rate_limit_s))
                continue
            try:
                response.raise_for_status()
            except httpx.HTTPError as exc:
                raise S2Error(f"Semantic Scholar returned an error: {exc}") from exc
            return response.json().get("data") or []
    return []
