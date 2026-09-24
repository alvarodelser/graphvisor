"""The whole per-document flow against Neo4j, with canned LLM output shaped
like the old prompts' output schemas."""

import json

import pytest

from app.shared import neo4j

pytestmark = pytest.mark.neo4j

L1 = json.dumps({"MajorClaim": [{"text": "Autophagy protects neurons."}],
                 "Arguments": [{"text": "Atg7 loss causes inclusion bodies."},
                               {"text": "Rapamycin restores flux."}]})


def classification(kind):
    return json.dumps({"primary_type": kind, "secondary_types": [], "epistemic_strength": "strong",
                       "confidence": 0.9, "reasoning": "because"})


def l2(subject, obj, relation="causes"):
    return json.dumps({"relations": [{
        "subject": subject, "relation": relation, "object": obj, "argument_type": "causal",
        "epistemic_strength": "strong", "confidence": 0.8, "source_argument_id": 0,
        "reasoning": "stated"}]})


def test_json_document_end_to_end(client):
    r = client.post("/collections/smoke/start")
    assert r.status_code == 200, r.text
    assert r.json()["expected"] == 2
    ref = {"collection": "smoke", "id": "DOC1"}

    r = client.post("/documents/load", json=ref)
    assert r.json()["kind"] == "json"
    content = r.json()["content_parsed"]
    assert content.startswith("# Introduction")

    # Chunker output with an abstract chunk, which becomes the abstract.
    r = client.post("/documents/chunks", json={**ref, "content_parsed": content,
                    "chunk_list": ["abstract text", "chunk one", "chunk two"],
                    "chunk_title": ["Abstract", "Introduction", "Results"]})
    body = r.json()
    assert body["needs_abstract"] is False
    assert body["chunks"] == [{"input_text": "chunk one", "chunk_index": 0}, {"input_text": "chunk two", "chunk_index": 1}]

    r = client.post("/documents/arguments", json={**ref, "responses": [
        {"chunk_index": 1, "raw": L1}, {"chunk_index": 0, "raw": "garbage"}]})
    args = r.json()["argument_list"]
    assert r.json()["skipped_responses"] == 1
    assert sorted(a["TEXT"] for a in args) == sorted(
        ["Autophagy protects neurons.", "Atg7 loss causes inclusion bodies.", "Rapamycin restores flux."])
    assert [a["local_id"] for a in args] == [0, 1, 2]
    sources = neo4j.read("MATCH (a:Argument {collection: 'smoke'})-[:FROM_CHUNK]->(c:Chunk) "
                         "RETURN DISTINCT a.chunk_index AS i, c.text AS text")
    assert sources == [{"i": 1, "text": "chunk two"}]

    kinds = ["causal", "background", "Mechanistic"]
    r = client.post("/documents/classification", json={**ref, "results": [
        {"local_id": a["local_id"], "raw": classification(k)} for a, k in zip(args, kinds)]})
    graph_args = r.json()["graph_arguments"]
    assert [g["ARG_ID"] for g in graph_args] == [0, 2]

    # First attempt: one invalid response is reported for n8n to retry.
    r = client.post("/documents/entities", json={**ref, "results": [
        {"ARG_ID": 0, "raw": l2("Atg7 loss", "inclusion bodies")},
        {"ARG_ID": 2, "raw": "oops"}]})
    assert r.json() == {"collection": "smoke", "id": "DOC1", "saved": [0], "invalid": [2]}
    # Retry of the invalid one, plus a redelivery of the first (must not duplicate).
    r = client.post("/documents/entities", json={**ref, "results": [
        {"ARG_ID": 2, "raw": l2("rapamycin", "autophagic flux", "Up Regulates")},
        {"ARG_ID": 0, "raw": l2("Atg7 loss", "inclusion bodies")}]})
    assert r.json()["invalid"] == []

    rows = neo4j.read("""
        MATCH (a:Argument {collection: 'smoke', in_graph: true})
        RETURN a.local_id AS local, a.argument_id AS aid ORDER BY local""")
    assert rows == [{"local": 0, "aid": "a1"}, {"local": 2, "aid": "a2"}]
    rels = neo4j.read("""
        MATCH (:Entity {collection: 'smoke'})-[r]->(:Entity)
        RETURN type(r) AS t, r.argument_id AS aid ORDER BY aid""")
    assert rels == [{"t": "CAUSES", "aid": "a1"}, {"t": "UP_REGULATES", "aid": "a2"}]
    assert neo4j.read("MATCH (e:Entity {collection: 'smoke'}) RETURN count(e) AS n")[0]["n"] == 4

    r = client.post("/documents/done", json=ref)
    assert r.json()["collection_complete"] is False
    r = client.post("/documents/done", json=ref)  # redelivered
    assert r.json()["done"] == 1


def test_pdf_only_document_and_failure_completes_collection(client):
    client.post("/collections/smoke/start")
    ref = {"collection": "smoke", "id": "DOC2"}
    assert client.post("/documents/load", json=ref).json()["kind"] == "pdf"
    pdf = client.get("/documents/smoke/DOC2/pdf")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    assert client.get("/documents/smoke/..%2Fsecret/pdf").status_code in (404, 422)

    r = client.post("/documents/chunks", json={**ref, "content_parsed": "# T\n\ntext",
                    "chunk_list": ["only body"], "chunk_title": ["T"]})
    assert r.json()["needs_abstract"] is True
    assert client.post("/documents/abstract", json={**ref, "abstract": "generated"}).status_code == 200

    client.post("/documents/done", json=ref)
    r = client.post("/documents/failed", json={"collection": "smoke", "id": "DOC1",
                                               "step": "L1_extraction", "error": "timeout"})
    assert r.json()["collection_complete"] is True
    assert (r.json()["done"], r.json()["failed"]) == (1, 1)


def test_a_reloaded_document_is_processing_again_and_counted_once(client):
    client.post("/collections/smoke/start")
    ref = {"collection": "smoke", "id": "DOC1"}
    client.post("/documents/load", json=ref)
    assert client.post("/documents/done", json=ref).json()["done"] == 1
    # The same message delivered again: the document runs a second time.
    client.post("/documents/load", json=ref)
    [row] = neo4j.read("MATCH (c:Collection {uid: 'smoke'})-[:CONTAINS]->(d:Document {uid: 'smoke:DOC1'}) "
                       "RETURN d.status AS status, c.done AS done")
    assert row == {"status": "processing", "done": 0}
    assert client.post("/documents/done", json=ref).json()["done"] == 1
