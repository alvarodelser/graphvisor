"""Phase 2 against Neo4j on top of an ingested document."""

import json

import pytest

from app.shared import neo4j
from tests.test_ingest_flow import L1, classification, l2

pytestmark = pytest.mark.neo4j


def ingest_doc1(client):
    ref = {"collection": "smoke", "id": "DOC1"}
    client.post("/collections/smoke/start")
    content = client.post("/documents/load", json=ref).json()["content_parsed"]
    client.post("/documents/chunks", json={**ref, "content_parsed": content,
                "chunk_list": ["abs", "c1"], "chunk_title": ["Abstract", "Intro"]})
    args = client.post("/documents/arguments", json={**ref, "responses": [L1]}).json()["argument_list"]
    client.post("/documents/classification", json={**ref, "results": [
        {"local_id": a["local_id"], "raw": classification("causal")} for a in args]})
    client.post("/documents/entities", json={**ref, "results": [
        {"ARG_ID": a["local_id"], "raw": l2(f"s{a['local_id']}", f"o{a['local_id']}")} for a in args]})
    return args


def test_concepts_end_to_end(client):
    args = ingest_doc1(client)
    r = client.get("/collections/smoke/concept-batches").json()
    assert r["arguments"] == len(args) == 3
    assert r["batches"][0]["list_of_args"].startswith("['Argument: ")

    cand = client.post("/collections/smoke/concept-candidates", json={"responses": [
        json.dumps({"concepts": [{"concept": "Autophagy", "description": "cell recycling"},
                                 {"concept": "Neurodegeneration", "description": "neuron loss"}]})]}).json()
    assert cand["list_of_concepts"].startswith("concept: Autophagy: \n description:cell recycling\n")

    bad = client.post("/collections/smoke/concepts", json={"raw": "no"}).json()
    assert bad["valid"] is False
    validated = [{"concept": "Autophagy", "description": "cell recycling", "epistemic_strength": "high",
                  "confidence": 0.9},
                 {"concept": "Neurodegeneration", "description": "neuron loss",
                  "epistemic_strength": "moderate", "confidence": 0.7}]
    ok = client.post("/collections/smoke/concepts", json={"raw": json.dumps(validated)}).json()
    assert ok == {"collection": "smoke", "valid": True, "concepts": 2}

    assert client.post("/collections/smoke/concepts/index").json()["indexed"] == 2
    assert client.post("/collections/smoke/concepts/link").json()["linked"] == 3
    # Re-linking replaces, never duplicates.
    client.post("/collections/smoke/concepts/link")
    rows = neo4j.read("""
        MATCH (a:Argument {collection: 'smoke'})-[r:HAS_CONCEPT]->(c:Concept)
        RETURN a.uid AS a, count(r) AS n, min(r.score) AS lo, max(r.score) AS hi""")
    assert len(rows) == 3
    assert all(r["n"] == 2 for r in rows)  # only 2 concepts exist, top-3 caps at 2
    assert all(0.0 <= r["lo"] <= r["hi"] <= 1.0 for r in rows)
    ids = neo4j.read("MATCH (c:Concept {collection: 'smoke'}) RETURN c.concept_id AS i ORDER BY i")
    assert [r["i"] for r in ids] == [1, 2]
