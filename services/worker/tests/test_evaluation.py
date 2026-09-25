"""Ratings of hypotheses and arguments (needs Neo4j)."""

import pytest

from tests.conftest import CSRF, log_in_as

pytestmark = pytest.mark.neo4j

C = "smoke_eval"


@pytest.fixture
def collection(client):
    from app.shared import neo4j
    neo4j.write(
        """
        CREATE (:Collection {uid: $c, name: $c, collection: $c, status: 'ready'})
        CREATE (d:Document {uid: $c + ':d1', collection: $c, id: 'd1', status: 'done'})
        CREATE (d)-[:HAS_CHUNK]->(ch:Chunk {uid: $c + ':d1:0', collection: $c, index: 0, title: 'Results',
                                             text: 'Rapamycin restored autophagic flux in aged neurons.'})
        CREATE (d)-[:HAS_ARGUMENT]->(a:Argument {uid: $c + ':d1:1', collection: $c, argument_id: 'a1',
                                                 full_argument: 'Rapamycin restores flux.',
                                                 argument_type: 'finding', in_graph: true})
        CREATE (a)-[:FROM_CHUNK]->(ch)
        WITH range(0, 19) AS ids
        UNWIND ids AS i
        CREATE (:Hypothesis {uid: $c + ':k:' + i, collection: $c, concept: 'autophagy',
                             hypothesis: 'H' + i, novelty: 0.8, plausibility: 0.6, impact: 0.7, creativity: 0.5})
        """,
        c=C)
    return C


def _hypotheses(client):
    return [h for hs in client.get(f"/api/collections/{C}/hypotheses").json().values() for h in hs]


def test_blind_share_is_stable_per_user(client, collection):
    hs = _hypotheses(client)
    assert len(hs) == 20 and all(h["id"] for h in hs)
    assert 0 < sum(h["blind"] for h in hs) < 20  # 25% of 20, give or take
    assert [h["blind"] for h in _hypotheses(client)] == [h["blind"] for h in hs]

    client.put(f"/api/admin/collections/{C}/settings", headers=CSRF, json={"blind_fraction": 0})
    assert not any(h["blind"] for h in _hypotheses(client))


def test_rate_a_hypothesis(client, collection):
    hid = _hypotheses(client)[0]["id"]
    url = f"/api/collections/{C}/hypotheses/{hid}/evaluation"
    r = client.put(url, headers=CSRF, json={"verdict": "promising"})
    assert r.status_code == 200, r.text
    assert r.json()["model_novelty"] == 8.0 and "human_novelty" not in r.json()

    scores = {"novelty": 8, "plausibility": 3, "impact": 7, "creativity": 5}
    e = client.put(url, headers=CSRF, json={"verdict": "unsure", "scores": scores, "comment": "needs a control"}).json()
    assert e["verdict"] == "unsure" and e["human_plausibility"] == 3
    assert e["adjusted_plausibility"] and not e["adjusted_novelty"]
    assert e["target_text"] == "H0"

    mine = client.get(f"/api/collections/{C}/evaluations/mine").json()
    assert mine["counts"] == {"hypotheses": 1, "arguments": 0}
    assert mine["hypotheses"][hid]["comment"] == "needs a control"

    assert client.put(url, headers=CSRF, json={"verdict": "great"}).status_code == 422
    bad_scores = {**scores, "impact": 11}
    assert client.put(url, headers=CSRF, json={"verdict": "unsure", "scores": bad_scores}).status_code == 422
    assert client.put(f"/api/collections/{C}/hypotheses/nope/evaluation", headers=CSRF,
                      json={"verdict": "unsure"}).status_code == 404


def test_rate_an_argument(client, collection):
    assert client.get(f"/api/collections/{C}/arguments/a1/source").json()["text"].startswith("Rapamycin")
    url = f"/api/collections/{C}/arguments/a1/evaluation"
    e = client.put(url, headers=CSRF, json={
        "verdict": "wrong", "reasons": ["misquoted"], "comment": "it's aged mice",
        "relations": [{"subject": "rapamycin", "relation": "restores", "object": "flux", "verdict": "wrong"}],
        "entities": [{"name": "rapamycin", "verdict": "correct"}]}).json()
    assert e["verdict"] == "wrong" and e["reasons"] == ["misquoted"]
    assert e["wrong_relations"] == 1 and e["wrong_entities"] == 0
    assert e["relations"][0]["relation"] == "restores"
    assert client.get(f"/api/collections/{C}/evaluations/mine").json()["arguments"]["a1"]["verdict"] == "wrong"
    assert client.put(url, headers=CSRF, json={"verdict": "wrong", "reasons": ["bogus"]}).status_code == 422


def test_ratings_are_per_user_and_exported_for_admins(client, collection):
    hid = _hypotheses(client)[0]["id"]
    client.put(f"/api/collections/{C}/hypotheses/{hid}/evaluation", headers=CSRF, json={"verdict": "promising"})
    admin_cookies = dict(client.cookies)

    log_in_as(client, "evaluator", [C])
    assert client.get(f"/api/collections/{C}/evaluations/mine").json()["counts"]["hypotheses"] == 0
    client.put(f"/api/collections/{C}/hypotheses/{hid}/evaluation", headers=CSRF, json={"verdict": "not_useful"})
    assert client.get("/api/admin/evaluations").status_code == 403
    assert client.post("/api/events", headers=CSRF, json={"type": "hypothesis_copied", "collection": C,
                                                          "target": hid}).json() == {"ok": True}

    client.cookies.clear()
    client.cookies.update(admin_cookies)
    exported = client.get("/api/admin/evaluations", params={"collection": C}).json()
    assert sorted(e["verdict"] for e in exported) == ["not_useful", "promising"]
    assert all(e["user_email"].endswith("@smoke.test") for e in exported)
