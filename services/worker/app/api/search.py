"""Semantic search over a collection's arguments, for GraphVisor's search bars.
The query is embedded with the same BGE-M3 vectorizer as the arguments and
matched through the argument_embedding vector index. (Lexical searches, on
titles and entity names, run in the browser on data it already has.)"""

from fastapi import APIRouter, Depends, Path, Query

from app.api.corpus import _require_ready
from app.auth.deps import collection_user
from app.shared import neo4j, vectorizer
from app.shared.models import COLLECTION_PATTERN

router = APIRouter(prefix="/api")

# Community edition filters after the index search, so ask the index for more
# candidates than we return: other collections' arguments may come first.
CANDIDATES_PER_RESULT = 20
MAX_CANDIDATES = 2000


@router.get("/collections/{collection}/search/arguments")
def search_arguments(collection: str = Path(pattern=COLLECTION_PATTERN),
                     q: str = Query(min_length=2, max_length=500),
                     k: int = Query(20, ge=1, le=100), user: dict = Depends(collection_user)):
    _require_ready(collection)
    [vector] = vectorizer.embed_or_502([q.strip()], "query")
    rows = neo4j.read(
        """
        CALL db.index.vector.queryNodes('argument_embedding', $candidates, $v) YIELD node, score
        WHERE node.collection = $c AND node.in_graph
        RETURN node.argument_id AS arg_id, node.document_id AS document_id,
               node.full_argument AS text, node.argument_type AS argument_type, score
        ORDER BY score DESC LIMIT $k
        """,
        candidates=min(k * CANDIDATES_PER_RESULT, MAX_CANDIDATES), v=vector, c=collection, k=k)
    # score is Neo4j's cosine score, (1 + cos) / 2, in [0, 1]
    return {"query": q, "results": rows}
