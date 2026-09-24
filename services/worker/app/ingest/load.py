"""Load one document: validate <id>.json and rebuild its text as markdown for
the chunker, or mark it as PDF-only (n8n then OCRs it)."""

import json
from functools import lru_cache

import jsonschema
from fastapi import APIRouter, HTTPException

from app.shared import events, neo4j
from app.shared.config import settings
from app.shared.models import DocRef

router = APIRouter()


@lru_cache
def _validator() -> jsonschema.Draft202012Validator:
    schema = json.loads(settings().schema_path.read_text(encoding="utf-8"))
    return jsonschema.Draft202012Validator(schema)


def build_markdown(body: list[dict]) -> str:
    """Paragraphs in reading order; a heading line is emitted whenever the
    heading path changes, from the first level that differs (depth n -> n '#').
    The chunker splits on these titles like it does on OCR markdown."""
    lines: list[str] = []
    current: list[str] = []
    for para in body:
        path = [h for h in (para.get("headings") or []) if h]
        common = 0
        while common < min(len(path), len(current)) and path[common] == current[common]:
            common += 1
        for depth in range(common, len(path)):
            lines.append(f"{'#' * (depth + 1)} {path[depth]}")
        current = path
        lines.append(para["text"].strip())
    return "\n\n".join(lines)


def reopen(collection: str, uid: str) -> None:
    """A document loaded again (a redelivered or re-queued message) is processing
    again: take it back out of the collection's done/failed count, so closing it
    doesn't count it twice, and drop the previous run's stage times. Without this
    a re-run stays "done" and is invisible on the dashboard."""
    neo4j.write(
        """
        MATCH (c:Collection {uid: $c})-[:CONTAINS]->(d:Document {uid: $uid})
        WITH c, d, coalesce(d.status, '') AS before
        SET c.done = c.done - CASE WHEN before = 'done' THEN 1 ELSE 0 END,
            c.failed = c.failed - CASE WHEN before = 'failed' THEN 1 ELSE 0 END,
            d.failed_step = null, d.error = null
        REMOVE d.chunked_at, d.abstract_at, d.l1_at, d.classified_at, d.l2_at
        """,
        c=collection, uid=uid)


@router.post("/documents/load")
def load(ref: DocRef):
    folder = settings().input_dir / ref.collection
    json_path, pdf_path = folder / f"{ref.id}.json", folder / f"{ref.id}.pdf"
    uid = neo4j.uid(ref.collection, ref.id)
    reopen(ref.collection, uid)

    if json_path.is_file():
        doc = json.loads(json_path.read_text(encoding="utf-8"))
        errors = sorted(_validator().iter_errors(doc), key=lambda e: e.path)
        if errors:
            raise HTTPException(422, f"{json_path.name}: {errors[0].message}")
        neo4j.write(
            """
            MATCH (c:Collection {uid: $c})
            MERGE (d:Document {uid: $uid})
            SET d.collection = $c, d.id = $id, d.source = 'json', d.status = 'processing', d.loaded_at = timestamp(),
                d.title = $title, d.year = $year, d.doi = $doi,
                d.abstract = $abstract, d.citations = $citations
            MERGE (c)-[:CONTAINS]->(d)
            """,
            c=ref.collection, uid=uid, id=doc.get("id") or ref.id, title=doc["title"],
            year=int(doc["year"]), doi=doc.get("doi"), abstract=doc.get("abstract") or None,
            citations=doc.get("citations"))
        events.stage(ref.collection, ref.id, "prepare", source="json")
        return {"collection": ref.collection, "id": ref.id, "kind": "json",
                "content_parsed": build_markdown(doc["body"])}

    if pdf_path.is_file():
        neo4j.write(
            """
            MATCH (c:Collection {uid: $c})
            MERGE (d:Document {uid: $uid})
            SET d.collection = $c, d.id = $id, d.source = 'pdf', d.status = 'processing', d.loaded_at = timestamp()
            MERGE (c)-[:CONTAINS]->(d)
            """,
            c=ref.collection, uid=uid, id=ref.id)
        events.stage(ref.collection, ref.id, "prepare", source="pdf")
        return {"collection": ref.collection, "id": ref.id, "kind": "pdf"}

    raise HTTPException(404, f"no {ref.id}.json or {ref.id}.pdf in {folder}")
