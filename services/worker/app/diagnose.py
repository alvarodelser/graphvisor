"""Diagnostics: can the worker reach every service it depends on, and do
they answer as the pipeline expects? Run by services/diagnose.sh (together
with the n8n-side checks in the graphvisor_diagnose workflow).

GET /diagnose             -> {"ok": bool, "checks": [{"check", "ok", "detail", "ms"}]}
GET /diagnose/sample.pdf  -> a one-page text PDF for the OCR check
"""

import json
import time

import numpy as np
from fastapi import APIRouter
from fastapi.responses import Response

from app.shared import neo4j, openalex, semanticscholar, vectorizer
from app.shared.config import settings

router = APIRouter(tags=["diagnose"])

REQUIRED_CONSTRAINTS = {"collection_uid", "document_uid", "chunk_uid", "argument_uid",
                        "entity_uid", "concept_uid", "topic_uid"}
REQUIRED_VECTOR_INDEXES = {"concept_embedding", "document_embedding", "argument_embedding"}
# A paper with a DOI, a title and many citations on both APIs.
KNOWN_DOI = "10.1038/nature14539"
KNOWN_TITLE = "Deep learning"
SAMPLE_LINES = ["GraphVisor diagnostic page", "Autophagy removes misfolded proteins from neurons."]


class CheckFailed(Exception):
    pass


def _expect(condition: bool, message: str) -> None:
    if not condition:
        raise CheckFailed(message)


def check_neo4j() -> str:
    rows = neo4j.read("SHOW INDEXES YIELD name, type, state RETURN name, type, state")
    names = {r["name"] for r in rows}
    constraints = {r["name"] for r in neo4j.read("SHOW CONSTRAINTS YIELD name RETURN name")}
    missing = sorted((REQUIRED_CONSTRAINTS - constraints) | (REQUIRED_VECTOR_INDEXES - names))
    _expect(not missing, f"missing schema items {missing}: re-run `docker compose ... graphdb/docker-compose.yml up -d` and check `docker logs graphvisor-neo4j-schema`")
    offline = [r["name"] for r in rows if r["name"] in REQUIRED_VECTOR_INDEXES and r["state"] != "ONLINE"]
    _expect(not offline, f"vector indexes not ONLINE: {offline}")
    return f"connected; {len(constraints)} constraints, vector indexes online"


def check_vectorizer() -> str:
    vecs = vectorizer.embed(["autophagy in neurons", "autophagy in neurons", "stock market prices"])
    s = settings()
    _expect(all(len(v) == s.embedding_dim for v in vecs), f"expected {s.embedding_dim}-d vectors")
    a, b, c = (np.asarray(v) for v in vecs)
    _expect(abs(np.linalg.norm(a) - 1) < 1e-3, f"vectors not normalized (|v| = {np.linalg.norm(a):.3f})")
    _expect(float(a @ b) > 0.99, "identical texts got different vectors")
    _expect(float(a @ c) < float(a @ b), "unrelated text scored as similar as identical text")
    return f"{s.vectorizer_model}, {len(a)}-d, normalized; related/unrelated cosine {a @ b:.2f}/{a @ c:.2f}"


def check_input() -> str:
    s = settings()
    _expect(s.input_dir.is_dir(), f"{s.input_dir} is not mounted")
    schema = json.loads(s.schema_path.read_text(encoding="utf-8"))
    _expect(set(schema.get("required", [])) == {"title", "year", "body"}, "unexpected document.schema.json")
    collections = sorted(p.name for p in s.input_dir.iterdir() if p.is_dir() and not p.name.startswith("."))
    return f"{s.input_dir} readable; collections: {', '.join(collections) or '(none)'}"


def check_openalex() -> str:
    work = openalex.get_by_doi(KNOWN_DOI)
    _expect(bool(work), f"DOI {KNOWN_DOI} not found")
    _expect((work.get("cited_by_count") or 0) > 0, "no cited_by_count in the answer")
    return f"DOI lookup ok ({work.get('display_name')!r}: {work['cited_by_count']} citations)"


def check_semanticscholar() -> str:
    hits = semanticscholar.search_paper(KNOWN_TITLE)
    _expect(bool(hits), "no results")
    _expect(any(h.get("citationCount") is not None for h in hits), "no citationCount in the answer")
    return f"title search ok ({len(hits)} results)"


CHECKS = [
    ("neo4j", check_neo4j, True),
    ("vectorizer", check_vectorizer, True),
    ("input folder", check_input, True),
    ("openalex", check_openalex, True),
    # Unauthenticated Semantic Scholar throttles hard; it's only the citation fallback.
    ("semantic scholar", check_semanticscholar, False),
]


EXTERNAL = {"openalex", "semantic scholar"}


def run_checks(external: bool = True) -> dict:
    """external=False skips the public citation APIs (slow, rate-limited)."""
    results = []
    for name, check, required in CHECKS:
        if not external and name in EXTERNAL:
            continue
        start = time.monotonic()
        try:
            detail, ok = check(), True
        except Exception as exc:  # noqa: BLE001 - every failure is reported, not raised
            detail, ok = f"{type(exc).__name__}: {exc}", False
        results.append({"check": f"worker -> {name}", "ok": ok, "required": required, "detail": detail,
                        "ms": round((time.monotonic() - start) * 1000)})
    return {"ok": all(r["ok"] for r in results if r["required"]), "checks": results}


def sample_pdf(lines: list[str] = SAMPLE_LINES) -> bytes:
    """A minimal one-page PDF with real text (Helvetica), for the OCR check."""
    text = " ".join(f"({line}) Tj 0 -28 Td" for line in lines)
    stream = f"BT /F1 18 Tf 72 720 Td {text} ET".encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R "
        b"/Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out, offsets = bytearray(b"%PDF-1.4\n"), []
    for i, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    out += b"".join(b"%010d 00000 n \n" % o for o in offsets)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, xref)
    return bytes(out)


@router.get("/diagnose")
def diagnose(quick: bool = False):
    """quick=true: only the services on n8n-net (used by graphvisor_diagnose)."""
    return run_checks(external=not quick)


@router.get("/diagnose/sample.pdf")
def diagnose_sample_pdf():
    return Response(sample_pdf(), media_type="application/pdf")
