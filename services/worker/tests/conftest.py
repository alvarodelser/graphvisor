"""Integration tests (marked `neo4j`) run against a real graphvisor-neo4j.

Locally: start services/graphdb (see services/README.md) and export
NEO4J_URI=bolt://localhost:7688 and NEO4J_PASSWORD; otherwise they're skipped.
The vectorizer is always faked: deterministic unit vectors from the text."""

import hashlib
import os
from pathlib import Path

import numpy as np
import pytest

FIXTURES = Path(__file__).parent / "fixtures" / "input"


def fake_embed(texts, input_type="passage"):
    out = []
    for t in texts:
        seed = int(hashlib.sha256(t.encode()).hexdigest()[:8], 16)
        v = np.random.default_rng(seed).normal(size=1024)
        out.append((v / np.linalg.norm(v)).tolist())
    return out


@pytest.fixture
def client(monkeypatch):
    if not os.environ.get("NEO4J_PASSWORD"):
        pytest.skip("NEO4J_PASSWORD not set: no graphvisor-neo4j to test against")
    monkeypatch.setenv("NEO4J_URI", os.environ.get("NEO4J_URI", "bolt://localhost:7688"))
    monkeypatch.setenv("INPUT_DIR", str(FIXTURES))

    from app.shared import config, neo4j, vectorizer
    config.settings.cache_clear()
    neo4j.driver.cache_clear()
    from app.ingest import load
    load._validator.cache_clear()
    monkeypatch.setattr(vectorizer, "embed", fake_embed)

    try:
        neo4j.read("RETURN 1")
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"Neo4j not reachable: {exc}")

    from fastapi.testclient import TestClient
    from app.main import app
    neo4j.write("MATCH (n) WHERE n.collection STARTS WITH 'smoke' DETACH DELETE n")
    yield TestClient(app)
    neo4j.write("MATCH (n) WHERE n.collection STARTS WITH 'smoke' DETACH DELETE n")
    neo4j.driver().close()
    neo4j.driver.cache_clear()
    config.settings.cache_clear()
