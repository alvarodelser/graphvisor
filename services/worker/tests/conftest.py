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
    # TestClient talks plain http to "testserver": the cookie can't be Secure
    # or scoped to /graphvisor there.
    monkeypatch.setenv("SESSION_COOKIE_SECURE", "false")
    monkeypatch.setenv("SESSION_COOKIE_PATH", "/")

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
    _clean(neo4j)
    test_client = TestClient(app)
    log_in_as(test_client, "admin")
    yield test_client
    _clean(neo4j)
    neo4j.driver().close()
    neo4j.driver.cache_clear()
    config.settings.cache_clear()


def _clean(neo4j):
    """Test data: collections named smoke*, and the accounts made by log_in_as."""
    neo4j.write("MATCH (n) WHERE n.collection STARTS WITH 'smoke' DETACH DELETE n")
    neo4j.write("MATCH (n:Evaluation) WHERE n.collection_name STARTS WITH 'smoke' DETACH DELETE n")
    neo4j.write("MATCH (n:CollectionSettings) WHERE n.name STARTS WITH 'smoke' DETACH DELETE n")
    neo4j.write("MATCH (s:Session)-[:OF]->(u:User) WHERE u.email ENDS WITH '@smoke.test' DETACH DELETE s")
    neo4j.write("MATCH (n:User) WHERE n.email ENDS WITH '@smoke.test' DETACH DELETE n")
    neo4j.write("MATCH (n:AccessCode) WHERE n.label STARTS WITH 'smoke' DETACH DELETE n")


CSRF = {"X-GraphVisor": "1"}


def log_in_as(test_client, role="admin", collections=("*",), name=None):
    """Sign a new account up with a fresh code of that role; the client keeps
    its session cookie. Returns the user as /api/auth/me shows it."""
    from app.auth import service
    name = name or f"{role}-{os.urandom(3).hex()}"
    code, _ = service.create_code(f"smoke {name}", role, list(collections))
    test_client.cookies.clear()
    r = test_client.post("/api/auth/signup", headers=CSRF, json={
        "name": name, "email": f"{name}@smoke.test", "password": "correct horse battery", "code": code})
    assert r.status_code == 200, r.text
    return r.json()
