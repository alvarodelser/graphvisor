"""Unit tests for shared citation HTTP retry helpers (no network)."""

from citation_http import compute_retry_delay


class _FakeResponse:
    def __init__(self, headers):
        self.headers = headers


def test_honors_numeric_retry_after_header():
    response = _FakeResponse({"Retry-After": "7"})
    assert compute_retry_delay(response, attempt=0, base=1.0) == 7.0


def test_caps_retry_after_at_ceiling():
    response = _FakeResponse({"Retry-After": "9999"})
    assert compute_retry_delay(response, attempt=0, base=1.0) == 60.0


def test_falls_back_to_exponential_backoff_when_no_header():
    response = _FakeResponse({})
    assert compute_retry_delay(response, attempt=0, base=1.0) == 2.0
    assert compute_retry_delay(response, attempt=1, base=1.0) == 4.0
    assert compute_retry_delay(response, attempt=2, base=1.0) == 8.0


def test_falls_back_when_retry_after_is_non_numeric():
    # HTTP-date Retry-After values are not parsed; fall back to backoff.
    response = _FakeResponse({"Retry-After": "Wed, 21 Oct 2025 07:28:00 GMT"})
    assert compute_retry_delay(response, attempt=1, base=1.0) == 4.0
