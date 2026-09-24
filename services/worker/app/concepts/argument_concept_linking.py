"""Link every in-graph argument to its 3 nearest concepts (old
argumnet_concept_linking(): Elasticsearch kNN, k=3).

The collection's concepts are few (tens), so the search is exact, in numpy,
instead of an over-fetching vector-index query that other collections could
crowd out. The score keeps Elasticsearch's cosine `_score`, (1 + cos) / 2, so
parent_concepts_cos means what it meant in the old data."""

import numpy as np
from fastapi import APIRouter, HTTPException

from app.concepts.common import check_collection
from app.shared import neo4j, vectorizer

router = APIRouter()

TOP_K = 3


def top_k(arg_vecs: np.ndarray, concept_vecs: np.ndarray, k: int = TOP_K) -> list[list[tuple[int, float]]]:
    """Per argument: (concept index, (1+cos)/2), best first. Vectors are unit length."""
    scores = (1.0 + arg_vecs @ concept_vecs.T) / 2.0
    out = []
    for row in scores:
        best = np.argsort(-row, kind="stable")[:k]
        out.append([(int(j), float(row[j])) for j in best])
    return out


@router.post("/collections/{collection}/concepts/link")
def argument_concept_linking(collection: str):
    check_collection(collection)
    concepts = neo4j.read("MATCH (n:Concept {collection: $c}) WHERE n.embedding IS NOT NULL "
                          "RETURN n.uid AS uid, n.embedding AS v ORDER BY n.concept_id", c=collection)
    if not concepts:
        raise HTTPException(422, f"collection {collection} has no indexed concepts")
    args = neo4j.read("MATCH (a:Argument {collection: $c, in_graph: true}) "
                      "RETURN a.uid AS uid, a.full_argument AS text ORDER BY a.uid", c=collection)
    if not args:
        return {"collection": collection, "linked": 0}

    arg_vecs = vectorizer.embed_or_502([a["text"] for a in args])
    links = top_k(np.asarray(arg_vecs), np.asarray([c["v"] for c in concepts]))
    neo4j.write("MATCH (:Argument {collection: $c})-[r:HAS_CONCEPT]->() DELETE r", c=collection)
    rows = [{"a": a["uid"], "v": v,
             "links": [{"c": concepts[j]["uid"], "score": s, "rank": rank}
                       for rank, (j, s) in enumerate(hits)]}
            for a, v, hits in zip(args, arg_vecs, links)]
    for start in range(0, len(rows), 500):
        neo4j.write(
            """
            UNWIND $rows AS row
            MATCH (a:Argument {uid: row.a})
            SET a.embedding = row.v
            WITH a, row
            UNWIND row.links AS l
            MATCH (c:Concept {uid: l.c})
            CREATE (a)-[:HAS_CONCEPT {score: l.score, rank: l.rank}]->(c)
            """,
            rows=rows[start:start + 500])
    return {"collection": collection, "linked": len(rows)}
