"""Shared HTTP retry helpers for the citation lookup clients."""

from __future__ import annotations

from typing import Any

RETRY_AFTER_CEILING_S = 60.0


def compute_retry_delay(response: Any, *, attempt: int, base: float) -> float:
    """Seconds to wait before retrying a throttled (429) request.

    Honors the server's ``Retry-After`` header when it is an integer number of
    seconds (capped at ``RETRY_AFTER_CEILING_S``). HTTP-date forms and missing
    headers fall back to exponential backoff: ``base * 2 ** (attempt + 1)``.
    """
    retry_after = response.headers.get("Retry-After")
    if retry_after:
        try:
            return min(float(retry_after), RETRY_AFTER_CEILING_S)
        except ValueError:
            pass
    return base * (2 ** (attempt + 1))
