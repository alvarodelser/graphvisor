"""Read API: shapes match the static files GraphVisor used before."""

import json
from pathlib import Path

import numpy as np
import pytest

from tests import test_enrichment_flow

pytestmark = pytest.mark.neo4j
SHAPE = json.loads((Path(__file__).parent / "fixtures" / "corpus_shape.json").read_text())
# relation_type only appears on a few relations of the old corpus (a later tool added it).
OPTIONAL = {"relation": {"relation_type"}}


def test_api_serves_the_old_static_shapes(client, monkeypatch):
    assert client.get("/api/collections/smoke/corpus").status_code == 404
    test_enrichment_flow.test_enrichment_end_to_end(client, monkeypatch)

    assert {"name": "smoke", "status": "ready"}.items() <= client.get("/api/collections").json()[0].items()
    corpus = client.get("/api/collections/smoke/corpus").json()
    assert len(corpus) == 2
    doc = corpus[0]
    assert set(SHAPE["document"]) <= set(doc)
    arg = doc["data"][0]
    assert set(SHAPE["argument"]) <= set(arg)
    assert set(SHAPE["concept_level"]) <= set(arg["concept_level"])
    assert set(SHAPE["relation"]) - OPTIONAL["relation"] <= set(arg["relations"][0])
    assert arg["arg_id"].startswith("a")
    assert len(arg["concept_level"]["parent_concepts"]) == len(arg["concept_level"]["parent_concepts_cos"])

    topics = client.get("/api/collections/smoke/topics").json()
    assert all(d.startswith("doc_") for t in topics for d in t["docIds"])
    concepts = client.get("/api/collections/smoke/concepts").json()
    assert [c["concept"] for c in concepts] == sorted(c["concept"] for c in concepts)

    docs_bin = client.get("/api/collections/smoke/doc_embeddings.bin").content
    assert len(np.frombuffer(docs_bin, dtype="<f4")) == 2 * 1024
    concepts_bin = client.get("/api/collections/smoke/concept_embeddings.bin").content
    assert len(np.frombuffer(concepts_bin, dtype="<f4")) == len(concepts) * 1024
    assert client.get("/api/collections/smoke/hypotheses").json() == {}
    assert client.get("/api/collections/BAD!/corpus").status_code == 422


def test_semantic_argument_search(client, monkeypatch):
    test_enrichment_flow.test_enrichment_end_to_end(client, monkeypatch)
    r = client.get("/api/collections/smoke/search/arguments", params={"q": "Rapamycin restores flux.", "k": 2})
    assert r.status_code == 200, r.text
    results = r.json()["results"]
    # the fake embedder maps equal texts to equal vectors: the argument itself ranks first
    assert results[0]["text"] == "Rapamycin restores flux."
    assert results[0]["score"] > 0.99 and results[0]["arg_id"].startswith("a")
    assert len(results) == 2 and results[0]["document_id"] == "DOC1"
    assert client.get("/api/collections/smoke/search/arguments", params={"q": "x"}).status_code == 422
