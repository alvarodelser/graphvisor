"""Pure functions of the ingest steps (no Neo4j, no network)."""

import json
from pathlib import Path

from app.ingest.load import build_markdown
from app.ingest.save_chunks import split_abstract
from app.ingest.save_L1_arguments import collect_arguments, rank
from app.ingest.save_L2_entities import graph_rows, normalize_relation, parse_relations
from app.ingest.start import list_documents

FIXTURES = Path(__file__).parent / "fixtures" / "input"


def test_list_documents_pairs_json_and_pdf_and_ignores_the_rest():
    docs = list_documents(FIXTURES / "smoke")
    assert docs == [
        {"id": "DOC1", "has_json": True, "has_pdf": False},
        {"id": "DOC2", "has_json": False, "has_pdf": True},
    ]


def test_build_markdown_emits_headings_only_when_the_path_changes():
    body = json.loads((FIXTURES / "smoke" / "DOC1.json").read_text())["body"]
    assert build_markdown(body) == "\n\n".join([
        "# Introduction",
        "Autophagy removes misfolded proteins.",
        "Its failure is linked to neurodegeneration.",
        "# Results", "## Atg7 ablation",
        "Atg7 loss caused inclusion bodies in neurons.",
        "## Rescue",
        "Rapamycin restored autophagic flux.",
        "# Discussion",
        "Enhancing autophagy may slow disease progression.",
    ])


def test_split_abstract_matches_old_get_chunks():
    chunks = ["intro", "abs part 1", "body", "abs part 2"]
    titles = ["Introduction", " Abstract ", "Methods", "SUMMARY"]
    abstract, rest, rest_titles = split_abstract(chunks, titles)
    assert abstract == "abs part 1 abs part 2"
    assert rest == ["intro", "body"]
    assert rest_titles == ["Introduction", "Methods"]


def test_split_abstract_without_abstract_chunks():
    assert split_abstract(["a", "b"], ["x", "y"]) == ("", ["a", "b"], ["x", "y"])


def test_collect_arguments_merges_claims_and_arguments_and_skips_bad_responses():
    responses = [
        '{"MajorClaim": [{"text": "claim"}], "Arguments": [{"text": "arg1"}, {"text": " "}]}',
        "not json at all",
        '```json\n{"Arguments": [{"text": "arg2"}, "stray"]}\n```',
        "[1, 2]",
    ]
    assert collect_arguments(responses) == (["claim", "arg1", "arg2"], 2, [0, 0, 2])


def test_collect_arguments_keeps_the_chunk_each_argument_came_from():
    from app.ingest.save_L1_arguments import L1Response
    responses = [L1Response(chunk_index=4, raw='{"Arguments": [{"text": "x"}]}'),
                 L1Response(chunk_index=1, raw='{"MajorClaim": [{"text": "y"}], "Arguments": [{"text": "z"}]}')]
    assert collect_arguments(responses) == (["x", "y", "z"], 0, [4, 1, 1])


def test_rank_sorts_by_cosine_descending():
    ranked = rank([1.0, 0.0], [[0.0, 1.0], [1.0, 0.0], [0.6, 0.8]])
    assert [i for i, _ in ranked] == [1, 2, 0]
    assert ranked[0][1] == 1.0


def test_normalize_relation():
    assert normalize_relation("causes") == "causes"
    assert normalize_relation("Is Part Of") == "is_part_of"
    assert normalize_relation("up-regulates / activates") == "up_regulates_activates"


def test_parse_relations_and_graph_rows_filter_like_main_neo4j():
    raw = json.dumps({"relations": [
        {"subject": "Atg7 loss", "relation": "causes", "object": "inclusion bodies",
         "argument_type": "Causal", "confidence": 0.9, "source_argument_id": 2},
        {"subject": "x", "relation": "describes", "object": "y", "argument_type": "background"},
        {"subject": "", "relation": "causes", "object": "y", "argument_type": "causal"},
    ]})
    rels = parse_relations(raw)
    assert [r["argument_type"] for r in rels] == ["causal", "background", "causal"]
    rows = graph_rows(rels)
    assert list(rows) == ["CAUSES"]
    assert [r["subject"] for r in rows["CAUSES"]] == ["Atg7 loss"]
