"""Ratings from researchers while they explore, plus implicit interaction events.

  (:Evaluation {uid, kind, collection_name, target_uid, target_text, user_uid, verdict, …,
                created_at, updated_at})-[:BY]->(:User)

One evaluation per user per item: saving again updates it. There is no
`collection` property (it's `collection_name`), so re-ingesting a collection
keeps its ratings; the rated text is copied in, since re-ingested items get
new ids.

Hypotheses: a verdict, then (optionally) the four scores, prefilled with the
model's or, for the user's blind share, from scratch, then a comment. Which
hypotheses are blind for whom is fixed: a hash of user and hypothesis.
Arguments: faithful or wrong, reasons, per-relation and per-entity checks."""

import hashlib
import json
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth.admin import blind_fraction
from app.auth.deps import admin_user, collection_user, current_user
from app.shared import events, neo4j

router = APIRouter(prefix="/api", tags=["evaluation"])

CRITERIA = ("novelty", "plausibility", "impact", "creativity")
ARGUMENT_REASONS = ("not_in_paper", "misquoted", "claims_merged", "wrong_type", "other")


def is_blind(user_uid: str, hypothesis_uid: str, fraction: float) -> bool:
    h = int(hashlib.sha256(f"{user_uid}|{hypothesis_uid}".encode()).hexdigest()[:8], 16)
    return h / 0xFFFFFFFF < fraction


class Scores(BaseModel):
    novelty: float = Field(ge=1, le=10)
    plausibility: float = Field(ge=1, le=10)
    impact: float = Field(ge=1, le=10)
    creativity: float = Field(ge=1, le=10)


class HypothesisEvaluationIn(BaseModel):
    verdict: Literal["promising", "unsure", "not_useful"]
    scores: Scores | None = None
    comment: str | None = Field(default=None, max_length=5000)


class PartCheck(BaseModel):
    verdict: Literal["correct", "wrong"]
    comment: str | None = Field(default=None, max_length=2000)


class RelationCheck(PartCheck):
    subject: str
    relation: str
    object: str


class EntityCheck(PartCheck):
    name: str


class ArgumentEvaluationIn(BaseModel):
    verdict: Literal["faithful", "wrong"]
    reasons: list[Literal["not_in_paper", "misquoted", "claims_merged", "wrong_type", "other"]] = []
    corrected_type: str | None = None
    comment: str | None = Field(default=None, max_length=5000)
    relations: list[RelationCheck] = []
    entities: list[EntityCheck] = []


class UIEventIn(BaseModel):
    type: str = Field(max_length=64)
    collection: str | None = None
    target: str | None = Field(default=None, max_length=200)
    data: dict = {}


def _save(uid: str, props: dict, user_uid: str) -> dict:
    rows = neo4j.write(
        """
        MATCH (u:User {uid: $user})
        MERGE (e:Evaluation {uid: $uid})
          ON CREATE SET e.created_at = datetime()
        SET e += $props, e.updated_at = datetime()
        MERGE (e)-[:BY]->(u)
        RETURN e {.*, created_at: toString(e.created_at), updated_at: toString(e.updated_at)} AS e
        """,
        uid=uid, props=props, user=user_uid)
    return _public(rows[0]["e"])


def _public(e: dict) -> dict:
    out = {k: v for k, v in e.items() if k not in ("details_json",)}
    if e.get("details_json"):
        out.update(json.loads(e["details_json"]))
    return out


@router.put("/collections/{collection}/hypotheses/{hypothesis_uid}/evaluation")
def rate_hypothesis(collection: str, hypothesis_uid: str, body: HypothesisEvaluationIn,
                    user: dict = Depends(collection_user)):
    rows = neo4j.read("MATCH (h:Hypothesis {uid: $h, collection: $c}) RETURN h {.*} AS h",
                      h=hypothesis_uid, c=collection)
    if not rows:
        raise HTTPException(404, "no such hypothesis")
    h = rows[0]["h"]
    uid = f"{user['uid']}|{hypothesis_uid}"
    existing = neo4j.read("MATCH (e:Evaluation {uid: $uid}) RETURN e.blind AS blind", uid=uid)
    blind = existing[0]["blind"] if existing else is_blind(user["uid"], hypothesis_uid, blind_fraction(collection))
    props = {"kind": "hypothesis", "collection_name": collection, "target_uid": hypothesis_uid,
             "target_text": h["hypothesis"], "concept": h.get("concept"), "user_uid": user["uid"],
             "verdict": body.verdict, "comment": body.comment, "blind": blind}
    for k in CRITERIA:
        model = h.get(k)
        props[f"model_{k}"] = round(model * 10, 2) if model is not None else None
    if body.scores:
        for k in CRITERIA:
            human = getattr(body.scores, k)
            props[f"human_{k}"] = human
            props[f"adjusted_{k}"] = props[f"model_{k}"] is None or abs(human - props[f"model_{k}"]) > 1e-6
    events.emit("evaluation", kind="hypothesis", user=user["uid"], collection=collection,
                target=hypothesis_uid, verdict=body.verdict, blind=blind, scored=body.scores is not None)
    return _save(uid, props, user["uid"])


@router.put("/collections/{collection}/arguments/{arg_id}/evaluation")
def rate_argument(collection: str, arg_id: str, body: ArgumentEvaluationIn, user: dict = Depends(collection_user)):
    rows = neo4j.read("MATCH (a:Argument {collection: $c, argument_id: $a}) "
                      "RETURN a.uid AS uid, a.full_argument AS text, a.argument_type AS type", c=collection, a=arg_id)
    if not rows:
        raise HTTPException(404, "no such argument")
    a = rows[0]
    details = {"reasons": body.reasons, "corrected_type": body.corrected_type,
               "relations": [r.model_dump() for r in body.relations],
               "entities": [e.model_dump() for e in body.entities]}
    props = {"kind": "argument", "collection_name": collection, "target_uid": a["uid"], "argument_id": arg_id,
             "target_text": a["text"], "argument_type": a["type"], "user_uid": user["uid"],
             "verdict": body.verdict, "comment": body.comment, "details_json": json.dumps(details, ensure_ascii=False),
             "wrong_relations": sum(r.verdict == "wrong" for r in body.relations),
             "wrong_entities": sum(e.verdict == "wrong" for e in body.entities)}
    events.emit("evaluation", kind="argument", user=user["uid"], collection=collection, target=arg_id,
                verdict=body.verdict, reasons=body.reasons, relations_checked=len(body.relations),
                entities_checked=len(body.entities))
    return _save(f"{user['uid']}|{a['uid']}", props, user["uid"])


@router.get("/collections/{collection}/evaluations/mine")
def my_evaluations(collection: str, user: dict = Depends(collection_user)):
    rows = neo4j.read(
        "MATCH (e:Evaluation {collection_name: $c, user_uid: $u}) "
        "RETURN e {.*, created_at: toString(e.created_at), updated_at: toString(e.updated_at)} AS e",
        c=collection, u=user["uid"])
    hypotheses, arguments = {}, {}
    for r in rows:
        e = _public(r["e"])
        if e["kind"] == "hypothesis":
            hypotheses[e["target_uid"]] = e
        else:
            arguments[e["argument_id"]] = e
    return {"hypotheses": hypotheses, "arguments": arguments,
            "counts": {"hypotheses": len(hypotheses), "arguments": len(arguments)}}


@router.get("/collections/{collection}/arguments/{arg_id}/source")
def argument_source(collection: str, arg_id: str, user: dict = Depends(collection_user)):
    rows = neo4j.read(
        "MATCH (a:Argument {collection: $c, argument_id: $a})-[:FROM_CHUNK]->(ch:Chunk) "
        "RETURN ch.index AS chunk_index, ch.title AS title, ch.text AS text", c=collection, a=arg_id)
    if not rows:
        raise HTTPException(404, "no source passage recorded for this argument")
    return rows[0]


@router.post("/events")
def ui_event(body: UIEventIn, user: dict = Depends(current_user)):
    """Implicit signals from the UI (copying a hypothesis, following it to its
    evidence, picking a search result…), logged for the observability stack."""
    events.emit("ui_event", type=body.type, user=user["uid"], collection=body.collection,
                target=body.target, **{f"data_{k}": v for k, v in list(body.data.items())[:20]})
    return {"ok": True}


@router.get("/admin/evaluations")
def export_evaluations(collection: str | None = None, user: dict = Depends(admin_user)):
    rows = neo4j.read(
        """
        MATCH (e:Evaluation)-[:BY]->(u:User)
        WHERE $c IS NULL OR e.collection_name = $c
        RETURN e {.*, created_at: toString(e.created_at), updated_at: toString(e.updated_at),
                  user_name: u.name, user_email: u.email} AS e
        ORDER BY e.collection_name, e.kind, e.updated_at
        """,
        c=collection)
    return [_public(r["e"]) for r in rows]
