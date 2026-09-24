"""Store generated hypotheses (one LLM answer per concept batch): Hypothesis
nodes ABOUT their concept, EVIDENCED_BY the arguments they cite. Unparsable
answers are returned in `invalid` so the workflow can ask again."""

import logging
import re

from fastapi import APIRouter
from pydantic import BaseModel

from app.concepts.common import check_collection
from app.shared import llm_json, neo4j

router = APIRouter()
logger = logging.getLogger(__name__)

SCORE_KEYS = ("novelty", "plausibility", "impact", "creativity")


class HypothesisBatch(BaseModel):
    concept: str
    batch: int
    raw: str


class HypothesesIn(BaseModel):
    results: list[HypothesisBatch]


def normalize_evidence(raw) -> list[str]:
    """Argument ids as a1, a2…: the old answers mixed "a12", 12 and "12"."""
    items = raw if isinstance(raw, list) else [raw] if raw not in (None, "") else []
    out = []
    for item in items:
        m = re.fullmatch(r"a?(\d+)", str(item).strip())
        if m and f"a{m.group(1)}" not in out:
            out.append(f"a{m.group(1)}")
    return out


def _score(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def parse_hypotheses(raw: str) -> list[dict]:
    data = llm_json.loads(raw)
    items = data.get("hypotheses") if isinstance(data, dict) else data
    if not isinstance(items, list):
        raise llm_json.LLMJSONError("no 'hypotheses' list")
    out = []
    for h in items:
        if not isinstance(h, dict) or not str(h.get("hypothesis") or "").strip():
            continue
        scores = h.get("scores") if isinstance(h.get("scores"), dict) else {}
        out.append({
            "hypothesis": str(h["hypothesis"]).strip(),
            "research_question": h.get("research_question"),
            "rationale": h.get("rationale"),
            "evidence": normalize_evidence(h.get("evidence")),
            **{k: _score(scores.get(k)) for k in SCORE_KEYS},
        })
    if not out:
        raise llm_json.LLMJSONError("no hypotheses in the answer")
    return out


@router.post("/collections/{collection}/hypotheses")
def save_hypotheses(collection: str, body: HypothesesIn):
    check_collection(collection)
    saved, invalid = [], []
    for r in body.results:
        try:
            hypotheses = parse_hypotheses(r.raw)
        except llm_json.LLMJSONError as exc:
            logger.warning("hypotheses %s/%s batch %s: %s", collection, r.concept, r.batch, exc)
            invalid.append({"concept": r.concept, "batch": r.batch})
            continue
        key = f"{collection}:{r.concept}:{r.batch}"
        # retry-safe: a batch answered again replaces its earlier hypotheses
        neo4j.write("MATCH (h:Hypothesis {collection: $c, seed: $key}) DETACH DELETE h", c=collection, key=key)
        neo4j.write(
            """
            MATCH (k:Concept {uid: $c + ':' + $concept})
            UNWIND range(0, size($rows) - 1) AS i
            WITH k, i, $rows[i] AS h
            CREATE (x:Hypothesis {uid: $key + ':' + i, collection: $c, seed: $key, concept: $concept,
                                  hypothesis: h.hypothesis, research_question: h.research_question,
                                  rationale: h.rationale, evidence: h.evidence,
                                  novelty: h.novelty, plausibility: h.plausibility,
                                  impact: h.impact, creativity: h.creativity})
            CREATE (x)-[:ABOUT]->(k)
            WITH x, h
            UNWIND h.evidence AS aid
            MATCH (a:Argument {collection: $c, argument_id: aid})
            CREATE (x)-[:EVIDENCED_BY]->(a)
            """,
            c=collection, concept=r.concept, key=key, rows=hypotheses)
        saved.append({"concept": r.concept, "batch": r.batch, "hypotheses": len(hypotheses)})
    return {"collection": collection, "saved": saved, "invalid": invalid}
