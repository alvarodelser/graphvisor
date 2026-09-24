"""Structured events for the observability stack."""

import json

import pytest

from app.shared import events


def lines(capsys):
    return [json.loads(l) for l in capsys.readouterr().out.splitlines() if l.startswith("{")]


def test_emit_writes_one_json_line(capsys):
    events.emit("x", level="warning", a=1)
    [line] = lines(capsys)
    assert line["event"] == "x" and line["level"] == "warning" and line["a"] == 1
    assert line["service_name"] == "graphvisor-worker" and "ts" in line


def test_stage_seconds_between_consecutive_stages():
    t = {"loaded_at": 0, "chunked_at": 60_000, "abstract_at": None, "l1_at": 660_000,
         "classified_at": 960_000, "l2_at": 1_260_000}
    assert events.stage_seconds(t, 1_270_000) == {
        "prepare_s": 60.0, "l1_s": 600.0, "classification_s": 300.0, "l2_s": 300.0, "total_s": 1270.0}


def test_stage_codes_cover_the_flow(capsys, monkeypatch):
    from app.shared import neo4j
    monkeypatch.setattr(neo4j, "write", lambda *a, **k: [])
    events.stage("smoke", "DOC1", "l1_extraction", chunks=3)
    [line] = lines(capsys)
    assert (line["event"], line["doc_id"], line["stage_code"]) == ("document_stage", "smoke:DOC1", 3)
    with pytest.raises(KeyError):
        events.stage("smoke", "DOC1", "unknown")


@pytest.mark.neo4j
def test_requests_and_documents_are_logged(client, capsys):
    from tests.test_concepts_flow import ingest_doc1
    ingest_doc1(client)
    client.post("/documents/done", json={"collection": "smoke", "id": "DOC1"})
    out = lines(capsys)
    steps = [l for l in out if l["event"] == "worker_step"]
    assert {"load", "save_chunks", "save_L1_arguments", "done"} <= {s["step"] for s in steps}
    assert all(s["doc_id"] == "smoke:DOC1" for s in steps if s["step"] == "load")
    stages = [l["stage"] for l in out if l["event"] == "document_stage"]
    assert stages == ["prepare", "l1_extraction", "classification", "l2_entities", "done"]
    [done] = [l for l in out if l["event"] == "document_done"]
    assert done["graph_arguments"] == 3 and done["entities"] == 6 and "total_s" in done


@pytest.mark.neo4j
def test_poller_repeats_the_current_stage_of_processing_documents(client, capsys):
    client.post("/collections/smoke/start")
    client.post("/documents/load", json={"collection": "smoke", "id": "DOC1"})
    capsys.readouterr()
    events.poll_collections()
    out = lines(capsys)
    [progress] = [l for l in out if l["event"] == "collection_progress" and l["collection"] == "smoke"]
    assert progress["expected"] == 2 and progress["status"] == "processing"
    [beat] = [l for l in out if l["event"] == "document_stage"]
    assert (beat["doc_id"], beat["stage"], beat["heartbeat"]) == ("smoke:DOC1", "prepare", True)


@pytest.mark.neo4j
def test_finalize_steps_log_collection_stages(client, capsys, monkeypatch):
    from tests import test_enrichment_flow
    test_enrichment_flow.test_enrichment_end_to_end(client, monkeypatch)
    stages = [l["stage"] for l in lines(capsys) if l["event"] == "collection_stage" and not l.get("heartbeat")]
    assert stages == ["linking", "metadata", "citations", "map", "topics", "ready"]  # hypotheses: tests/test_hypotheses.py
    [row] = neo4j_status()
    assert row == {"status": "ready", "stage": "ready"}


@pytest.mark.neo4j
def test_poller_repeats_the_stage_of_finalizing_collections(client, capsys, monkeypatch):
    from tests.test_concepts_flow import ingest_doc1
    ingest_doc1(client)
    client.get("/collections/smoke/concept-batches")
    capsys.readouterr()
    events.poll_collections()
    beats = [l for l in lines(capsys) if l["event"] == "collection_stage"]
    assert [(b["collection"], b["stage"], b["heartbeat"]) for b in beats] == [("smoke", "concept_construction", True)]


def neo4j_status():
    from app.shared import neo4j
    return neo4j.read("MATCH (c:Collection {uid: 'smoke'}) RETURN c.status AS status, c.stage AS stage")
