"""The diagnostic endpoint: sample PDF and check reporting (services faked)."""

import io

import pytest
from pypdf import PdfReader

from app import diagnose
from app.diagnose import SAMPLE_LINES, run_checks, sample_pdf


def test_sample_pdf_is_a_valid_pdf_with_extractable_text():
    reader = PdfReader(io.BytesIO(sample_pdf()))
    assert len(reader.pages) == 1
    text = reader.pages[0].extract_text()
    assert all(line in text for line in SAMPLE_LINES)


def test_failures_are_reported_and_only_required_checks_decide(monkeypatch):
    def boom():
        raise RuntimeError("unreachable")
    monkeypatch.setattr(diagnose, "CHECKS", [
        ("ok one", lambda: "fine", True),
        ("optional", boom, False),
    ])
    report = run_checks()
    assert report["ok"] is True
    assert report["checks"][1] == {**report["checks"][1], "check": "worker -> optional", "ok": False,
                                   "detail": "RuntimeError: unreachable"}
    monkeypatch.setattr(diagnose, "CHECKS", [("required", boom, True)])
    assert run_checks()["ok"] is False


@pytest.mark.neo4j
def test_neo4j_check_against_the_real_schema(client):
    assert "vector indexes online" in diagnose.check_neo4j()


def test_vectorizer_check_rejects_unnormalized_vectors(monkeypatch):
    from app.shared import vectorizer
    monkeypatch.setattr(vectorizer, "embed", lambda texts, input_type="passage": [[2.0] + [0.0] * 1023] * 3)
    with pytest.raises(diagnose.CheckFailed, match="not normalized"):
        diagnose.check_vectorizer()


def test_quick_mode_skips_the_public_citation_apis(monkeypatch):
    monkeypatch.setattr(diagnose, "CHECKS", [
        ("neo4j", lambda: "ok", True), ("openalex", lambda: "ok", True),
        ("semantic scholar", lambda: "ok", False),
    ])
    assert [c["check"] for c in run_checks(external=False)["checks"]] == ["worker -> neo4j"]
