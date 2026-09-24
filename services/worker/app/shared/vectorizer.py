"""Client for IARAG's BGE-M3 vectorizer (POST /embed).

`model` is passed and `collection` is not: the vectorizer resolves a collection
through IARAG's registry and rejects names it doesn't know.
"""

import httpx
from fastapi import HTTPException

from app.shared.config import settings


class VectorizerError(RuntimeError):
    pass


def embed(texts: list[str], input_type: str = "passage") -> list[list[float]]:
    s = settings()
    vectors: list[list[float]] = []
    with httpx.Client(timeout=s.vectorizer_timeout_s) as client:
        for start in range(0, len(texts), s.vectorizer_batch_size):
            batch = texts[start : start + s.vectorizer_batch_size]
            payload = {"texts": batch, "model": s.vectorizer_model,
                       "input_type": input_type, "normalize": True}
            try:
                response = client.post(s.vectorizer_url, json=payload)
                response.raise_for_status()
            except httpx.HTTPError as exc:
                raise VectorizerError(f"vectorizer batch at {start}: {exc}") from exc
            data = response.json()
            got = data.get("embeddings") or []
            if len(got) != len(batch) or data.get("dim") != s.embedding_dim:
                raise VectorizerError(
                    f"vectorizer batch at {start}: {len(got)} vectors of dim "
                    f"{data.get('dim')}, expected {len(batch)} of {s.embedding_dim}")
            vectors.extend(got)
    return vectors


def embed_or_502(texts: list[str], input_type: str = "passage") -> list[list[float]]:
    """embed() for endpoints: a vectorizer failure is the upstream's fault (502)."""
    try:
        return embed(texts, input_type)
    except VectorizerError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
