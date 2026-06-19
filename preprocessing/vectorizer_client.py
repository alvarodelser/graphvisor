"""HTTP client for the local BGE-M3 vectorizer service."""

from __future__ import annotations

import httpx

from config import DEFAULT_BATCH_SIZE, DEFAULT_TIMEOUT_S, DEFAULT_VECTORIZER_URL


class VectorizerError(RuntimeError):
    pass


def embed_texts(
    texts: list[str],
    *,
    url: str = DEFAULT_VECTORIZER_URL,
    batch_size: int = DEFAULT_BATCH_SIZE,
    normalize: bool = False,
    timeout_s: float = DEFAULT_TIMEOUT_S,
) -> list[list[float]]:
    if not texts:
        return []

    client_timeout = httpx.Timeout(timeout_s)
    embeddings: list[list[float]] = []

    with httpx.Client(timeout=client_timeout) as client:
        for start in range(0, len(texts), batch_size):
            batch = texts[start : start + batch_size]
            payload = {"texts": batch, "normalize": normalize}
            try:
                response = client.post(url, json=payload)
                response.raise_for_status()
            except httpx.HTTPError as exc:
                raise VectorizerError(
                    f"Vectorizer request failed for batch {start // batch_size + 1}: {exc}"
                ) from exc

            data = response.json()
            batch_embeddings = _extract_embeddings(data)
            if len(batch_embeddings) != len(batch):
                raise VectorizerError(
                    f"Expected {len(batch)} embeddings, got {len(batch_embeddings)} "
                    f"(batch starting at index {start})"
                )
            embeddings.extend(batch_embeddings)

    return embeddings


def check_vectorizer(url: str = DEFAULT_VECTORIZER_URL, timeout_s: float = 10.0) -> None:
    probe = embed_texts(["health check"], url=url, batch_size=1, timeout_s=timeout_s)
    if not probe or not probe[0]:
        raise VectorizerError("Vectorizer health check returned an empty embedding")


def _extract_embeddings(payload: dict) -> list[list[float]]:
    if "embeddings" in payload:
        return payload["embeddings"]
    if "embedding" in payload:
        return [payload["embedding"]]
    raise VectorizerError(f"Unexpected vectorizer response keys: {list(payload.keys())}")
