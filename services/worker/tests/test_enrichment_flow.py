"""Phase 3 against Neo4j, external citation APIs faked."""

import json

import pytest

from app.shared import neo4j, openalex, semanticscholar
from tests.test_concepts_flow import ingest_doc1  # noqa: F401 (helper, not a test)

pytestmark = pytest.mark.neo4j


def test_enrichment_end_to_end(client, monkeypatch):
    monkeypatch.setattr(openalex, "get_by_doi", lambda doi: {"cited_by_count": 42})
    monkeypatch.setattr(openalex, "search_paper", lambda title, per_page=5: [])
    monkeypatch.setattr(semanticscholar, "search_paper", lambda title, limit=5: [])

    ingest_doc1(client)
    client.post("/documents/done", json={"collection": "smoke", "id": "DOC1"})
    # DOC2 (PDF-only): no title/year -> filename, OpenAlex (none) -> LLM.
    ref2 = {"collection": "smoke", "id": "DOC2"}
    client.post("/documents/load", json=ref2)
    client.post("/documents/chunks", json={**ref2, "content_parsed": "x",
                "chunk_list": ["first chunk text"], "chunk_title": ["Intro"]})
    client.post("/documents/done", json=ref2)

    concepts = [{"concept": "Autophagy", "description": "d", "epistemic_strength": "high", "confidence": 0.9},
                {"concept": "Neurons", "description": "d", "epistemic_strength": "high", "confidence": 0.8}]
    client.post("/collections/smoke/concepts", json={"raw": json.dumps(concepts)})
    client.post("/collections/smoke/concepts/index")
    client.post("/collections/smoke/concepts/link")

    meta = client.post("/collections/smoke/metadata").json()
    assert [p["id"] for p in meta["needs_llm"]] == ["DOC2"]
    assert meta["needs_llm"][0]["text"] == "first chunk text"
    r = client.post("/documents/metadata", json={**ref2, "raw": '{"title": "Found title", "year": 2019}'})
    assert r.json()["valid"] is True

    cit = client.post("/collections/smoke/citations").json()
    assert cit["found"] == 1 and len(cit["missing"]) == 1  # DOC1 by DOI; DOC2 has no match

    assert client.post("/collections/smoke/doc-embeddings").json()["embedded"] == 2
    g = client.post("/collections/smoke/grounding").json()
    assert g == {"collection": "smoke", "documents": 2, "concepts": 2}

    t = client.post("/collections/smoke/topics").json()
    assert t["topics"] >= 1 and t["to_label"][0]["concepts"].startswith("- ")
    labels = client.post("/collections/smoke/topic-labels", json={"labels": [
        {"topic_id": t["to_label"][0]["topic_id"], "raw": '"Autophagy in neurons"'}]}).json()["labels"]
    assert "Autophagy in neurons" in labels.values()
    assert client.post("/collections/smoke/ready").json()["status"] == "ready"

    docs = neo4j.read("MATCH (d:Document {collection: 'smoke'}) RETURN d.id AS id, d.title AS title, "
                      "d.year AS year, d.citations AS cit, d.pca_x IS NOT NULL AS placed ORDER BY id")
    assert docs[0]["cit"] == 42 and docs[1]["title"] == "Found title" and docs[1]["year"] == 2019
    assert all(d["placed"] for d in docs)
    grounded = neo4j.read("MATCH (k:Concept {collection: 'smoke'}) WHERE k.radius >= 0.15 RETURN count(k) AS n")
    assert grounded[0]["n"] == 2
