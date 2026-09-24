"""Concept steps against the old pipeline's exact text handling."""

import json

import numpy as np
import pytest

from app.concepts.argument_concept_linking import top_k
from app.concepts.concept_batches import argument_lines, batches
from app.concepts.save_concept_candidates import candidates_text
from app.concepts.save_concepts import parse_concepts
from app.shared.llm_json import LLMJSONError

TEXTS = [f"arg {i}" for i in range(31)] + ["two\nlines", "  padded  "]


def old_batches(tmp_path, texts, chunk_size=15):
    """The old merge_all_arguments() + concept_constructor() text path."""
    f = tmp_path / "argument_all_corpus.txt"
    with open(f, "w", encoding="utf-8") as out:
        for item in texts:
            out.write(f"Argument: {item}\n")
    with open(f, "r", encoding="utf-8") as src:
        args = [line.strip() for line in src if line.strip()]
    chunks = [args[i:i + chunk_size] for i in range(0, len(args), chunk_size)]
    return ["{list_of_args}".format(list_of_args=c) for c in chunks]


def test_batches_match_old_prompt_text_byte_for_byte(tmp_path):
    assert batches(argument_lines(TEXTS)) == old_batches(tmp_path, TEXTS)
    assert len(batches(argument_lines(TEXTS))) == 3


def test_candidates_text_matches_old_all_concepts_txt():
    responses = [
        json.dumps({"concepts": [{"concept": "Autophagy", "description": "d1"},
                                 {"concept": "Mitophagy", "description": "d2"}]}),
        "not json",
        json.dumps({"concepts": [{"concept": "Proteostasis", "description": "d3"}, {"nodesc": 1}]}),
    ]
    text, skipped = candidates_text(responses)
    assert text == ("concept: Autophagy: \n description:d1\n"
                    "concept: Mitophagy: \n description:d2\n"
                    "concept: Proteostasis: \n description:d3\n")
    assert skipped == 2


def test_parse_concepts_array_wrapped_and_invalid():
    arr = [{"concept": "A", "description": "a", "epistemic_strength": "high", "confidence": 0.9},
           {"concept": "A", "description": "dup"}, {"concept": " B ", "description": "b"}]
    assert [c["name"] for c in parse_concepts(json.dumps(arr))] == ["A", "B"]
    assert [c["name"] for c in parse_concepts(json.dumps({"concepts": arr}))] == ["A", "B"]
    with pytest.raises(LLMJSONError):
        parse_concepts('{"a": 1, "b": 2}')
    with pytest.raises(LLMJSONError):
        parse_concepts("[]")


def test_top_k_uses_elasticsearch_cosine_score():
    concepts = np.eye(4)
    arg = np.array([[0.8, 0.6, 0.0, 0.0]])
    hits = top_k(arg, concepts)[0]
    assert [j for j, _ in hits] == [0, 1, 2]
    assert hits[0][1] == pytest.approx((1 + 0.8) / 2)
    assert hits[2][1] == pytest.approx(0.5)
