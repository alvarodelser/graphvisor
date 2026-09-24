"""2-D map positions (preprocessing/embed.py): PCA fitted jointly on document
vectors and concept-name vectors; each linked concept sits at the projected
centroid of its documents, with a radius = RMS distance of those documents
(floor 0.15)."""

import numpy as np
from fastapi import APIRouter, HTTPException
from sklearn.decomposition import PCA

from app.enrichment.common import check_collection
from app.shared import neo4j, vectorizer

router = APIRouter()

MIN_RADIUS = 0.15


def ground(doc_vecs: np.ndarray, concept_vecs: np.ndarray, concept_docs: list[list[int]]):
    pca = PCA(n_components=2)
    pca.fit(np.vstack([doc_vecs, concept_vecs]))
    doc_2d = pca.transform(doc_vecs)
    grounding = []
    for doc_indices in concept_docs:
        vecs = doc_vecs[sorted(set(doc_indices))]
        centroid = vecs.mean(axis=0)
        radius = float(np.sqrt(np.mean(np.linalg.norm(vecs - centroid, axis=1) ** 2))) if len(vecs) > 1 else 0.0
        x, y = pca.transform(centroid.reshape(1, -1))[0]
        grounding.append((float(x), float(y), max(radius, MIN_RADIUS)))
    return doc_2d, grounding


@router.post("/collections/{collection}/grounding")
def concept_grounding(collection: str):
    check_collection(collection)
    docs = neo4j.read("MATCH (d:Document {collection: $c}) WHERE d.embedding IS NOT NULL "
                      "RETURN d.uid AS uid, d.embedding AS v ORDER BY d.id", c=collection)
    if not docs:
        raise HTTPException(422, f"collection {collection} has no document embeddings")
    index = {d["uid"]: i for i, d in enumerate(docs)}
    links = neo4j.read(
        """
        MATCH (d:Document {collection: $c})-[:HAS_ARGUMENT]->(:Argument)-[:HAS_CONCEPT]->(k:Concept)
        RETURN k.uid AS uid, k.name AS name, collect(d.uid) AS docs ORDER BY k.name
        """,
        c=collection)
    links = [l for l in links if any(u in index for u in l["docs"])]
    if not links:
        raise HTTPException(422, f"collection {collection} has no linked concepts")

    name_vecs = vectorizer.embed_or_502([l["name"] for l in links])
    doc_2d, grounding = ground(np.asarray([d["v"] for d in docs]), np.asarray(name_vecs),
                               [[index[u] for u in l["docs"] if u in index] for l in links])
    neo4j.write("UNWIND $rows AS row MATCH (d:Document {uid: row.uid}) SET d.pca_x = row.x, d.pca_y = row.y",
                rows=[{"uid": d["uid"], "x": float(p[0]), "y": float(p[1])} for d, p in zip(docs, doc_2d)])
    neo4j.write(
        """
        MATCH (k:Concept {collection: $c}) REMOVE k.pca_x, k.pca_y, k.radius
        WITH count(*) AS _
        UNWIND $rows AS row MATCH (k:Concept {uid: row.uid})
        SET k.name_embedding = row.v, k.pca_x = row.x, k.pca_y = row.y, k.radius = row.r
        """,
        c=collection,
        rows=[{"uid": l["uid"], "v": v, "x": g[0], "y": g[1], "r": g[2]}
              for l, v, g in zip(links, name_vecs, grounding)])
    return {"collection": collection, "documents": len(docs), "concepts": len(links)}
