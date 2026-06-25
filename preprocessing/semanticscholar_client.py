"""HTTP client for the Semantic Scholar paper-search API (unauthenticated)."""

from __future__ import annotations

import time

import httpx

from citation_http import compute_retry_delay
from config import (
    CITATION_MAX_RETRIES,
    DEFAULT_CITATION_RATE_LIMIT_S,
    S2_SEARCH_URL,
)


class S2Error(RuntimeError):
    pass


def search_paper(
    title: str,
    *,
    url: str = S2_SEARCH_URL,
    limit: int = 5,
    rate_limit_s: float = DEFAULT_CITATION_RATE_LIMIT_S,
    max_retries: int = CITATION_MAX_RETRIES,
    timeout_s: float = 30.0,
) -> list[dict]:
    """Search Semantic Scholar for a paper by title.

    Returns the raw candidate list (the ``data`` array), each item carrying at
    least ``title`` and ``citationCount``. Returns ``[]`` when there are no
    results. Raises :class:`S2Error` if the request keeps failing after retries.
    """
    params = {
        "query": title,
        "fields": "title,citationCount",
        "limit": str(limit),
    }
    timeout = httpx.Timeout(timeout_s)

    with httpx.Client(timeout=timeout) as client:
        for attempt in range(max_retries):
            time.sleep(rate_limit_s)
            try:
                response = client.get(url, params=params)
            except httpx.HTTPError as exc:
                if attempt == max_retries - 1:
                    raise S2Error(f"Semantic Scholar request failed: {exc}") from exc
                time.sleep(rate_limit_s * (2 ** attempt))
                continue

            if response.status_code == 429:
                if attempt == max_retries - 1:
                    raise S2Error("Semantic Scholar rate limit (429) not cleared")
                time.sleep(compute_retry_delay(response, attempt=attempt, base=rate_limit_s))
                continue

            try:
                response.raise_for_status()
            except httpx.HTTPError as exc:
                raise S2Error(f"Semantic Scholar returned an error: {exc}") from exc

            data = response.json()
            return data.get("data") or []

    return []
