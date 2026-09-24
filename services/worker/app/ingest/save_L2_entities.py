"""Store L2 entity/relation extraction (one LLM response per graph argument)
and write the graph as the old main_neo4j.py did: Argument -HAS_SUBJECT/
HAS_OBJECT-> Entity, and a typed Entity -> Entity relation.

Unparsable responses are returned in `invalid` so n8n can re-ask the LLM for
just those (the old code retried each argument up to 3 times)."""

import json
import logging
import re
from collections import defaultdict

from fastapi import APIRouter
from pydantic import BaseModel

from app.shared import llm_json, neo4j
from app.shared.documents import delete_orphan_entities, require_document
from app.shared.models import DocRef

router = APIRouter()
logger = logging.getLogger(__name__)

# The old json_validator's list; anything else is normalized and logged.
KNOWN_RELATIONS = {
    "causes", "induces", "inhibits", "increases", "describes", "decreases", "reveals",
    "is_defined_as", "correlates_with", "associated_with", "supports", "contradicts",
    "analogous_to", "suggests", "may_cause", "may_associate_with",
}
# main_neo4j.py only drew relations whose own argument_type is one of these.
GRAPH_RELATION_TYPES = {"causal", "correlational", "mechanistic", "evidence",
                        "contradiction", "analogy"}
_REL_TYPE = re.compile(r"^[A-Z][A-Z0-9_]*$")


class L2Item(BaseModel):
    ARG_ID: int
    raw: str


class L2In(DocRef):
    results: list[L2Item]


def normalize_relation(name: str) -> str:
    """json_validator: known names pass; others lowercased with spaces -> '_'.
    Any other non-alphanumeric run also becomes '_' so the name is always a
    valid Neo4j relationship type once uppercased."""
    name = (name or "").strip()
    if name in KNOWN_RELATIONS:
        return name
    fixed = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
    logger.warning("unknown relation %r -> %r", name, fixed)
    return fixed


def parse_relations(raw: str) -> list[dict]:
    data = llm_json.loads(raw)
    rels = data.get("relations") if isinstance(data, dict) else None
    if not isinstance(rels, list):
        raise llm_json.LLMJSONError("no 'relations' list")
    out = []
    for r in rels:
        if not isinstance(r, dict):
            continue
        out.append({
            "subject": str(r.get("subject") or "").strip(),
            "relation": normalize_relation(str(r.get("relation") or "")),
            "object": str(r.get("object") or "").strip(),
            "argument_type": str(r.get("argument_type") or "").strip().lower(),
            "epistemic_strength": r.get("epistemic_strength"),
            "confidence": r.get("confidence"),
            "source_argument_id": r.get("source_argument_id"),
            "reasoning": r.get("reasoning"),
        })
    return out


def graph_rows(relations: list[dict]) -> dict[str, list[dict]]:
    """Relations drawn in the graph, grouped by Neo4j relationship type."""
    by_type: dict[str, list[dict]] = defaultdict(list)
    for r in relations:
        rel_type = r["relation"].upper()
        if (r["argument_type"] in GRAPH_RELATION_TYPES and r["subject"] and r["object"]
                and _REL_TYPE.match(rel_type)):
            by_type[rel_type].append(r)
    return by_type


def _write_argument(collection: str, arg_uid: str, relations: list[dict]) -> None:
    # Collection-wide argument id (the old merge's global a1, a2, ...), once.
    neo4j.write(
        """
        MATCH (c:Collection {uid: $c}), (a:Argument {uid: $a})
        WHERE a.argument_id IS NULL
        SET c.arg_counter = c.arg_counter + 1
        WITH a, c
        SET a.argument_id = 'a' + toString(c.arg_counter)
        """,
        c=collection, a=arg_uid)
    # Retry-safe: drop whatever a previous attempt drew for this argument.
    neo4j.write(
        """
        MATCH (a:Argument {uid: $a})
        OPTIONAL MATCH ()-[r {argument_uid: $a}]->()
        DELETE r
        WITH DISTINCT a
        OPTIONAL MATCH (a)-[h:HAS_SUBJECT|HAS_OBJECT]->()
        DELETE h
        """,
        a=arg_uid)
    for rel_type, rows in graph_rows(relations).items():
        # rel_type is validated against _REL_TYPE; Cypher can't parametrize types.
        neo4j.write(
            f"""
            MATCH (a:Argument {{uid: $a}})
            UNWIND $rows AS row
            MERGE (p:Entity {{uid: $c + ':' + row.subject}})
              ON CREATE SET p.collection = $c, p.name = row.subject
            SET p.epistemic_strength = row.epistemic_strength, p.confidence = row.confidence,
                p.source_argument_id = row.source_argument_id, p.reasoning = row.reasoning
            MERGE (t:Entity {{uid: $c + ':' + row.object}})
              ON CREATE SET t.collection = $c, t.name = row.object
            SET t.epistemic_strength = row.epistemic_strength, t.confidence = row.confidence,
                t.source_argument_id = row.source_argument_id, t.reasoning = row.reasoning
            MERGE (a)-[:HAS_SUBJECT]->(p)
            MERGE (a)-[:HAS_OBJECT]->(t)
            CREATE (p)-[r:{rel_type} {{argument_uid: a.uid}}]->(t)
            SET r.relation_type = row.relation, r.confidence = row.confidence,
                r.argument_id = a.argument_id, r.argument_type = row.argument_type,
                r.epistemic_strength = row.epistemic_strength, r.reasoning = row.reasoning,
                r.source_argument_id = row.source_argument_id
            """,
            a=arg_uid, c=collection, rows=rows)
    # The full relation list, as the old corpus JSON carried it per argument.
    neo4j.write("MATCH (a:Argument {uid: $a}) SET a.in_graph = true, a.relations_json = $j",
                a=arg_uid, j=json.dumps(relations, ensure_ascii=False))


@router.post("/documents/entities")
def save_L2_entities(body: L2In):
    require_document(body.collection, body.id)
    doc_uid = neo4j.uid(body.collection, body.id)
    saved, invalid = [], []
    for item in body.results:
        try:
            relations = parse_relations(item.raw)
        except llm_json.LLMJSONError as exc:
            logger.warning("L2 %s arg %s: %s", doc_uid, item.ARG_ID, exc)
            invalid.append(item.ARG_ID)
            continue
        _write_argument(body.collection, f"{doc_uid}:{item.ARG_ID}", relations)
        saved.append(item.ARG_ID)
    delete_orphan_entities(body.collection)
    return {"collection": body.collection, "id": body.id, "saved": saved, "invalid": invalid}
