"""Pure enrichment helpers."""

import numpy as np

from app.enrichment.concept_grounding import MIN_RADIUS, ground
from app.enrichment.doc_embedding import document_text
from app.enrichment.metadata import extract_info
from app.enrichment.topics import cluster, doc_concept_matrix, pick_k, topics_from


def test_extract_info_like_old_filename_parser():
    assert extract_info("Mismatch repair in E coli-1998") == ("Mismatch repair in E coli", 1998)
    assert extract_info("PMC123456") == ("PMC123456", None)


def test_document_text():
    assert document_text("T", "A", 2020) == "T\nA"
    assert document_text(None, "", 2020) == "Untitled document (2020)"


def test_pick_k_thresholds():
    assert [pick_k(n) for n in (2, 5, 6, 20, 21, 50, 51, 143)] == [2, 2, 3, 3, 4, 4, 5, 5]


def test_matrix_tf_idf_and_topics():
    doc_args = [
        [{"confidence": 1.0, "links": [{"concept": "a", "score": 1.0}]},
         {"confidence": 0.5, "links": [{"concept": "b", "score": 1.0}]}],
        [{"confidence": 1.0, "links": [{"concept": "b", "score": 0.8}]}],
        [],
    ]
    V = doc_concept_matrix(doc_args, ["a", "b"])
    # doc0: a = 1/2, b = 0.5/2; idf(a) = log(4/2)+1, idf(b) = log(4/3)+1
    assert np.allclose(V[0], [0.5 * (np.log(2) + 1), 0.25 * (np.log(4 / 3) + 1)])
    assert np.allclose(V[2], [0, 0])
    W, H = cluster(V, pick_k(3))
    assignments, topics = topics_from(W, H, ["a", "b"])
    assert assignments[2] == -1
    assert len(topics) == 2 and all(t["top_concepts"] for t in topics)


def test_cluster_caps_k_at_matrix_size():
    W, H = cluster(np.array([[1.0, 0.0]]), 5)
    assert W.shape == (1, 1)


def test_ground_places_concepts_at_their_documents():
    rng = np.random.default_rng(0)
    docs = rng.normal(size=(6, 8))
    concepts = rng.normal(size=(2, 8))
    doc_2d, grounding = ground(docs, concepts, [[0, 1, 1], [5]])
    assert doc_2d.shape == (6, 2)
    assert grounding[1][2] == MIN_RADIUS  # single document -> floor radius
    assert grounding[0][2] > 0
