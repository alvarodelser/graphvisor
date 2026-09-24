"""Topics (preprocessing/cluster_topics.py): NMF over a TF-IDF-weighted
document x concept matrix, K picked from the number of documents. The labels
come from the LLM (topic_label prompt) through save_topic_labels; a topic
without an LLM label falls back to its top three concepts, as before."""

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sklearn.decomposition import NMF

from app.enrichment.common import check_collection
from app.shared import events, neo4j

router = APIRouter()


def pick_k(n_docs: int) -> int:
    if n_docs <= 5:
        return 2
    if n_docs <= 20:
        return 3
    if n_docs <= 50:
        return 4
    return 5


def doc_concept_matrix(doc_args: list[list[dict]], concepts: list[str]) -> np.ndarray:
    """V[d, c] = sum over d's arguments of confidence * link score, / #arguments,
    then IDF-weighted so hub concepts don't dominate."""
    idx = {c: i for i, c in enumerate(concepts)}
    V = np.zeros((len(doc_args), len(concepts)))
    for d, args in enumerate(doc_args):
        if not args:
            continue
        for arg in args:
            confidence = arg["confidence"] if arg["confidence"] is not None else 1.0
            for link in arg["links"]:
                V[d, idx[link["concept"]]] += float(confidence) * float(link["score"])
        V[d, :] /= len(args)
    df = np.sum(V > 0, axis=0)
    return V * (np.log((len(doc_args) + 1) / (df + 1)) + 1.0)


def cluster(V: np.ndarray, k: int):
    M, N = V.shape
    k = max(1, min(k, M, N))  # nndsvd needs k <= min(M, N)
    if np.sum(V) == 0:
        W, H = np.zeros((M, k)), np.zeros((k, N))
        for i in range(M):
            W[i, i % k] = 1.0
        for j in range(k):
            H[j, j % N] = 1.0
        return W, H
    nmf = NMF(n_components=k, init="nndsvd", random_state=42, max_iter=1000)
    return nmf.fit_transform(V), nmf.components_


def topics_from(W: np.ndarray, H: np.ndarray, concepts: list[str]):
    assignments = [int(np.argmax(W[d])) if np.sum(W[d]) > 0 else -1 for d in range(W.shape[0])]
    topics = []
    for k in range(W.shape[1]):
        members = [d for d, t in enumerate(assignments) if t == k]
        if not members:  # a topic that won no argmax takes its 3 strongest documents
            members = [int(d) for d in np.argsort(W[:, k])[::-1] if W[d, k] > 0][:3]
        order = np.argsort(H[k])[::-1]
        top = [(concepts[j], float(H[k, j])) for j in order if H[k, j] > 0][:10]
        topics.append({"topic_id": k, "members": members, "top_concepts": top})
    return assignments, topics


class LabelItem(BaseModel):
    topic_id: int
    raw: str


class LabelsIn(BaseModel):
    labels: list[LabelItem] = []


@router.post("/collections/{collection}/topics")
def topics(collection: str):
    check_collection(collection)
    events.collection_stage(collection, "topics")
    rows = neo4j.read(
        """
        MATCH (d:Document {collection: $c, status: 'done'})
        OPTIONAL MATCH (d)-[:HAS_ARGUMENT]->(a:Argument {in_graph: true})
        OPTIONAL MATCH (a)-[l:HAS_CONCEPT]->(k:Concept)
        WITH d, a, collect(CASE WHEN k IS NULL THEN null ELSE {concept: k.name, score: l.score} END) AS links
        WITH d, collect(CASE WHEN a IS NULL THEN null ELSE {confidence: a.confidence, links: links} END) AS args
        RETURN d.uid AS uid, d.title AS title, args ORDER BY d.id
        """,
        c=collection)
    concepts = sorted({l["concept"] for r in rows for a in r["args"] for l in a["links"]})
    if not rows or not concepts:
        raise HTTPException(422, f"collection {collection} has no linked concepts to cluster")

    doc_args = [r["args"] for r in rows]
    W, H = cluster(doc_concept_matrix(doc_args, concepts), pick_k(len(rows)))
    assignments, found = topics_from(W, H, concepts)

    neo4j.write("MATCH (t:Topic {collection: $c}) DETACH DELETE t", c=collection)
    neo4j.write(
        """
        UNWIND $topics AS t
        CREATE (topic:Topic {uid: $c + ':' + t.topic_id, collection: $c, topic_id: t.topic_id,
                             top_concepts: t.names, top_weights: t.weights,
                             doc_uids: t.doc_uids, arg_count: t.arg_count})
        """,
        c=collection,
        topics=[{"topic_id": t["topic_id"], "names": [n for n, _ in t["top_concepts"]],
                 "weights": [w for _, w in t["top_concepts"]],
                 "doc_uids": [rows[d]["uid"] for d in t["members"]],
                 "arg_count": sum(len(doc_args[d]) for d in t["members"])} for t in found])
    neo4j.write(
        """
        UNWIND $rows AS row
        MATCH (d:Document {uid: row.uid}), (t:Topic {uid: $c + ':' + row.topic_id})
        CREATE (d)-[:IN_TOPIC]->(t)
        """,
        c=collection,
        rows=[{"uid": rows[d]["uid"], "topic_id": t} for d, t in enumerate(assignments) if t >= 0])

    to_label = [{
        "topic_id": t["topic_id"],
        "concepts": "\n".join(f"- {n} (weight: {w:.3f})" for n, w in t["top_concepts"]),
        "titles": "\n".join(f"- {rows[d]['title'] or 'Untitled paper'}" for d in t["members"]),
    } for t in found if t["top_concepts"]]
    return {"collection": collection, "topics": len(found), "to_label": to_label}


@router.post("/collections/{collection}/topic-labels")
def save_topic_labels(collection: str, body: LabelsIn):
    check_collection(collection)
    labels = {i.topic_id: i.raw.strip().strip('"').strip("'").strip() for i in body.labels}
    rows = neo4j.read("MATCH (t:Topic {collection: $c}) RETURN t.topic_id AS k, t.top_concepts AS top",
                      c=collection)
    updates = [{"k": r["k"], "label": labels.get(r["k"]) or
                (" / ".join(r["top"][:3]) if r["top"] else f"Topic {r['k'] + 1}")} for r in rows]
    neo4j.write("UNWIND $rows AS row MATCH (t:Topic {uid: $c + ':' + row.k}) SET t.label = row.label",
                c=collection, rows=updates)
    return {"collection": collection, "labels": {u["k"]: u["label"] for u in updates}}
