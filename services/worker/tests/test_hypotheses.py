"""Hypotheses: the old pipeline's seed files and answer format."""

import json
from pathlib import Path

import pytest

from app.hypotheses.hypothesis_seeds import render_batch, seeds_for
from app.hypotheses.save_hypotheses import normalize_evidence, parse_hypotheses
from app.shared import neo4j
from app.shared.llm_json import LLMJSONError

OLD_SAMPLE = Path(__file__).parent / "fixtures" / "old_hypotheses" / "sample.json"


def old_file(tmp_path, concept, batch):
    """What the old neo4j_argument_extraction() wrote for one batch."""
    f = tmp_path / "x.txt"
    with open(f, "w", encoding="utf-8") as out:
        out.write(f"### CONCEPT: {concept}\n")
        out.write(f"### NUM_ARGUMENTS: {len(batch)}\n\n")
        for arg in batch:
            out.write(f"ARGUMENT_ID: {arg['id']}\n")
            out.write(f"ARGUMENT:\n{arg['text']}\n\n")
    return f.read_text(encoding="utf-8")


def test_batch_text_matches_the_old_seed_files(tmp_path):
    args = [{"id": f"a{i}", "text": f"argument {i}"} for i in range(3)]
    assert render_batch("DNA repair", args) == old_file(tmp_path, "DNA repair", args)


def test_seeds_split_concepts_into_batches_of_200():
    concepts = [{"concept": "A", "arguments": [{"id": f"a{i}", "text": "t"} for i in range(450)]},
                {"concept": "B", "arguments": [{"id": "a1", "text": "t"}]}]
    seeds = seeds_for(concepts)
    assert [(s["concept"], s["batch"]) for s in seeds] == [("A", 0), ("A", 200), ("A", 400), ("B", 0)]
    assert "### NUM_ARGUMENTS: 50" in seeds[2]["arg_list"]


def test_parses_the_old_pipeline_output():
    raw = OLD_SAMPLE.read_text(encoding="utf-8")
    hyps = parse_hypotheses(raw)
    assert len(hyps) == len(json.loads(raw)["hypotheses"])
    h = hyps[0]
    assert h["hypothesis"] and h["research_question"] and h["rationale"]
    assert all(e.startswith("a") for e in h["evidence"])
    assert all(0 <= h[k] <= 1 for k in ("novelty", "plausibility", "impact", "creativity"))


def test_evidence_and_bad_answers():
    assert normalize_evidence(["a12", 7, "13", "a12", "x"]) == ["a12", "a7", "a13"]
    assert normalize_evidence("a3") == ["a3"]
    with pytest.raises(LLMJSONError):
        parse_hypotheses('{"hypotheses": []}')
    with pytest.raises(LLMJSONError):
        parse_hypotheses("not json")


@pytest.mark.neo4j
def test_hypotheses_end_to_end(client, monkeypatch):
    from tests import test_enrichment_flow
    test_enrichment_flow.test_enrichment_end_to_end(client, monkeypatch)
    seeds = client.get("/collections/smoke/hypothesis-seeds").json()["seeds"]
    assert seeds and seeds[0]["arg_list"].startswith("### CONCEPT: ")
    arg_ids = [l.split(": ")[1] for l in seeds[0]["arg_list"].splitlines() if l.startswith("ARGUMENT_ID: ")]

    answer = json.dumps({"hypotheses": [{
        "hypothesis": "H1", "research_question": "Q1", "rationale": "R1", "evidence": arg_ids[:2],
        "scores": {"novelty": 0.8, "plausibility": 0.7, "impact": 0.9, "creativity": 0.6}}]})
    r = client.post("/collections/smoke/hypotheses", json={"results": [
        {"concept": seeds[0]["concept"], "batch": 0, "raw": answer},
        {"concept": seeds[-1]["concept"], "batch": seeds[-1]["batch"], "raw": "oops"}]}).json()
    assert r["saved"][0]["hypotheses"] == 1
    assert r["invalid"] == [{"concept": seeds[-1]["concept"], "batch": seeds[-1]["batch"]}]
    # answering the same batch again replaces it
    client.post("/collections/smoke/hypotheses", json={"results": [
        {"concept": seeds[0]["concept"], "batch": 0, "raw": answer}]})

    links = neo4j.read("MATCH (h:Hypothesis {collection: 'smoke'}) OPTIONAL MATCH (h)-[:EVIDENCED_BY]->(a) "
                       "OPTIONAL MATCH (h)-[:ABOUT]->(k) RETURN count(DISTINCT h) AS h, count(DISTINCT a) AS a, "
                       "count(DISTINCT k) AS k")
    assert links == [{"h": 1, "a": len(arg_ids[:2]), "k": 1}]

    assert client.get("/api/collections/smoke/hypotheses").status_code == 409  # still finalizing
    client.post("/collections/smoke/ready")
    api = client.get("/api/collections/smoke/hypotheses").json()
    assert list(api) == [seeds[0]["concept"]]
    first = api[seeds[0]["concept"]][0]
    assert first.pop("id").startswith("smoke") and isinstance(first.pop("blind"), bool)
    assert first == {"hypothesis": "H1", "research_question": "Q1", "rationale": "R1",
        "evidence": arg_ids[:2], "scores": {"novelty": 0.8, "plausibility": 0.7, "impact": 0.9, "creativity": 0.6}}
