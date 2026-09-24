"""Read API for GraphVisor. It serves a ready collection in exactly the shapes
the old static files had (src/data/corpus.json, topics.json, concepts.json and
the two float32 .bin files), so GraphVisor's graph building stays unchanged.

Documents are always ordered by id: GraphVisor names them doc_<index>, and
topics refer to documents by that index."""

import json

import numpy as np
from fastapi import APIRouter, HTTPException, Path
from fastapi.responses import Response

from app.shared import neo4j
from app.shared.models import COLLECTION_PATTERN

router = APIRouter(prefix="/api")
CollectionPath = Path(pattern=COLLECTION_PATTERN)


def _require_ready(collection: str) -> None:
    rows = neo4j.read("MATCH (c:Collection {uid: $c}) RETURN c.status AS status", c=collection)
    if not rows:
        raise HTTPException(404, f"no collection {collection}")
    if rows[0]["status"] != "ready":
        raise HTTPException(409, f"collection {collection} is {rows[0]['status']}, not ready")


def _doc_uids(collection: str) -> list[str]:
    return [r["uid"] for r in neo4j.read(
        "MATCH (d:Document {collection: $c, status: 'done'}) RETURN d.uid AS uid ORDER BY d.id", c=collection)]


def _concepts(collection: str) -> list[dict]:
    """Grounded concepts sorted by name, as embed.py wrote concepts.json."""
    return neo4j.read(
        "MATCH (k:Concept {collection: $c}) WHERE k.radius IS NOT NULL "
        "RETURN k.name AS concept, k.pca_x AS pca_x, k.pca_y AS pca_y, k.radius AS radius, "
        "k.name_embedding AS v ORDER BY k.name", c=collection)


def _float32(vectors: list) -> Response:
    data = np.asarray(vectors, dtype="<f4").tobytes() if vectors else b""
    return Response(data, media_type="application/octet-stream")


@router.get("/collections")
def collections():
    return neo4j.read(
        "MATCH (c:Collection) RETURN c.name AS name, c.status AS status, c.expected AS expected, "
        "c.done AS done, c.failed AS failed ORDER BY c.name")


@router.get("/collections/{collection}/corpus")
def corpus(collection: str = CollectionPath):
    _require_ready(collection)
    rows = neo4j.read(
        """
        MATCH (d:Document {collection: $c, status: 'done'})
        OPTIONAL MATCH (d)-[:IN_TOPIC]->(t:Topic)
        OPTIONAL MATCH (d)-[:HAS_ARGUMENT]->(a:Argument {in_graph: true})
        OPTIONAL MATCH (a)-[h:HAS_CONCEPT]->(k:Concept)
        WITH d, t, a, h, k ORDER BY h.rank
        WITH d, t, a, collect(CASE WHEN k IS NULL THEN null
                                   ELSE {name: k.name, score: h.score, id: k.concept_id, description: k.description,
                                         strength: k.epistemic_strength, confidence: k.confidence} END) AS links
        WITH d, t, a, links ORDER BY a.local_id
        RETURN d.id AS doc_id, d {.title, .year, .abstract, .citations, .pca_x, .pca_y} AS doc,
               t.topic_id AS topic_id,
               collect(CASE WHEN a IS NULL THEN null ELSE a {.argument_id, .full_argument, .argument_type,
                       .confidence, .reasoning, .relations_json, links: links} END) AS args
        ORDER BY doc_id
        """,
        c=collection)
    out = []
    for r in rows:
        doc = r["doc"]
        data = []
        for a in r["args"]:
            links = a["links"]
            data.append({
                "arg_id": a["argument_id"],
                "full_argument": a["full_argument"],
                "argument_type": a["argument_type"],
                "confidence": a["confidence"],
                "reasoning": a["reasoning"],
                "relations": json.loads(a["relations_json"] or "[]"),
                # concept_id: the old linking kept the last hit's id
                "concept_level": {"concept_id": links[-1]["id"] if links else "",
                                  "parent_concepts": [l["name"] for l in links],
                                  "parent_concepts_cos": [l["score"] for l in links],
                                  "descriptions": [l["description"] for l in links],
                                  "epistemic_strength": [l["strength"] for l in links],
                                  "confidence": [l["confidence"] for l in links]},
            })
        out.append({"source": doc["title"], "year": str(doc["year"]) if doc["year"] else None,
                    "abstract": doc["abstract"], "citations": doc["citations"],
                    "pca_x": doc["pca_x"], "pca_y": doc["pca_y"],
                    "topic_id": r["topic_id"] if r["topic_id"] is not None else -1, "data": data})
    return out


@router.get("/collections/{collection}/topics")
def topics(collection: str = CollectionPath):
    _require_ready(collection)
    index = {uid: i for i, uid in enumerate(_doc_uids(collection))}
    rows = neo4j.read("MATCH (t:Topic {collection: $c}) RETURN t.topic_id AS id, t.label AS label, "
                      "t.doc_uids AS docs, t.arg_count AS args ORDER BY t.topic_id", c=collection)
    return [{"id": r["id"], "label": r["label"],
             "docIds": [f"doc_{index[u]}" for u in r["docs"] if u in index],
             "argCount": r["args"]} for r in rows]


@router.get("/collections/{collection}/concepts")
def concepts(collection: str = CollectionPath):
    _require_ready(collection)
    return [{k: c[k] for k in ("concept", "pca_x", "pca_y", "radius")} for c in _concepts(collection)]


@router.get("/collections/{collection}/doc_embeddings.bin")
def doc_embeddings(collection: str = CollectionPath):
    _require_ready(collection)
    rows = neo4j.read("MATCH (d:Document {collection: $c, status: 'done'}) RETURN d.embedding AS v "
                      "ORDER BY d.id", c=collection)
    return _float32([r["v"] for r in rows])


@router.get("/collections/{collection}/concept_embeddings.bin")
def concept_embeddings(collection: str = CollectionPath):
    _require_ready(collection)
    return _float32([c["v"] for c in _concepts(collection)])


@router.get("/collections/{collection}/hypotheses")
def hypotheses(collection: str = CollectionPath):
    """Hypothesis generation is out of scope for the automated pipeline."""
    _require_ready(collection)
    return []
