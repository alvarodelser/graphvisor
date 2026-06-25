"""HTTP client for the OpenAlex works API (fallback citation source)."""

from __future__ import annotations

import time

import httpx

from citation_http import compute_retry_delay
from config import (
    CITATION_MAX_RETRIES,
    DEFAULT_CITATION_RATE_LIMIT_S,
    OPENALEX_MAILTO,
    OPENALEX_WORKS_URL,
)


class OpenAlexError(RuntimeError):
    pass


def sanitize_query(title: str) -> str:
    """Strip characters that OpenAlex treats as filter syntax.

    Within a ``filter=title.search:<value>`` query, ``,`` separates filters and
    ``|`` separates OR alternatives, so an unescaped comma or pipe in the title
    produces a 400 Bad Request. Replace both with spaces and collapse whitespace.
    """
    cleaned = (title or "").replace(",", " ").replace("|", " ")
    return " ".join(cleaned.split())


def search_paper(
    title: str,
    *,
    url: str = OPENALEX_WORKS_URL,
    per_page: int = 5,
    mailto: str = OPENALEX_MAILTO,
    rate_limit_s: float = DEFAULT_CITATION_RATE_LIMIT_S,
    max_retries: int = CITATION_MAX_RETRIES,
    timeout_s: float = 30.0,
) -> list[dict]:
    """Search OpenAlex for a work by title.

    Returns the raw ``results`` array, each item carrying at least
    ``display_name`` and ``cited_by_count``. Returns ``[]`` when there are no
    results. Raises :class:`OpenAlexError` if the request keeps failing after
    retries.
    """
    params = {
        "filter": f"title.search:{sanitize_query(title)}",
        "select": "display_name,cited_by_count",
        "per-page": str(per_page),
        "mailto": mailto,
    }
    timeout = httpx.Timeout(timeout_s)

    with httpx.Client(timeout=timeout) as client:
        for attempt in range(max_retries):
            time.sleep(rate_limit_s)
            try:
                response = client.get(url, params=params)
            except httpx.HTTPError as exc:
                if attempt == max_retries - 1:
                    raise OpenAlexError(f"OpenAlex request failed: {exc}") from exc
                time.sleep(rate_limit_s * (2 ** attempt))
                continue

            if response.status_code == 429:
                if attempt == max_retries - 1:
                    raise OpenAlexError("OpenAlex rate limit (429) not cleared")
                time.sleep(compute_retry_delay(response, attempt=attempt, base=rate_limit_s))
                continue

            try:
                response.raise_for_status()
            except httpx.HTTPError as exc:
                raise OpenAlexError(f"OpenAlex returned an error: {exc}") from exc

            data = response.json()
            return data.get("results") or []

    return []
