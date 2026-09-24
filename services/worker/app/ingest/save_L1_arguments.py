"""Store L1 argument extraction (one LLM response per chunk) and rank the
arguments by similarity to the abstract, as the old ranking_arguments() did.
The rank becomes the argument's local id (the old arg_idx)."""

import logging

import numpy as np
from fastapi import APIRouter

from app.shared import events, llm_json, neo4j, vectorizer
from app.shared.documents import clear_arguments, require_document
from app.shared.models import DocRef

router = APIRouter()
logger = logging.getLogger(__name__)


class L1In(DocRef):
    responses: list[str]


def collect_arguments(responses: list[str]) -> tuple[list[str], int]:
    """MajorClaim + Arguments of every parsable response, in chunk order.
    Unparsable responses are skipped (logged), as in the old code; so are
    items that aren't {"text": non-empty}. Returns (texts, skipped responses)."""
    texts, skipped = [], 0
    for raw in responses:
        try:
            data = llm_json.loads(raw)
        except llm_json.LLMJSONError as exc:
            logger.error("L1 response not JSON: %s", exc)
            skipped += 1
            continue
        if not isinstance(data, dict):
            skipped += 1
            continue
        for key in ("MajorClaim", "Arguments"):
            for item in data.get(key) or []:
                text = item.get("text") if isinstance(item, dict) else None
                if isinstance(text, str) and text.strip():
                    texts.append(text.strip())
    return texts, skipped


def rank(abstract_vec: list[float], arg_vecs: list[list[float]]) -> list[tuple[int, float]]:
    """(original index, cosine) sorted by cosine, descending. Vectors come
    normalized from the vectorizer, so the dot product is the cosine."""
    scores = np.asarray(arg_vecs) @ np.asarray(abstract_vec)
    order = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)
    return [(i, float(scores[i])) for i in order]


@router.post("/documents/arguments")
def save_L1_arguments(body: L1In):
    doc = require_document(body.collection, body.id)
    texts, skipped = collect_arguments(body.responses)

    if texts and doc.get("abstract"):
        vecs = vectorizer.embed_or_502([doc["abstract"]], "query") + \
               vectorizer.embed_or_502(texts, "passage")
        ranked = rank(vecs[0], vecs[1:])
    else:
        ranked = [(i, None) for i in range(len(texts))]

    clear_arguments(body.collection, body.id)
    doc_uid = neo4j.uid(body.collection, body.id)
    neo4j.write("MATCH (d:Document {uid: $uid}) SET d.l1_at = timestamp()", uid=doc_uid)
    rows = [{"local_id": rank_pos, "text": texts[i], "cos": cos}
            for rank_pos, (i, cos) in enumerate(ranked)]
    neo4j.write(
        """
        MATCH (d:Document {uid: $doc_uid})
        UNWIND $rows AS row
        CREATE (d)-[:HAS_ARGUMENT]->(:Argument {
            uid: $doc_uid + ':' + row.local_id, collection: $c, document_id: $id,
            local_id: row.local_id, full_argument: row.text,
            cosine_similarity: row.cos, in_graph: false})
        """,
        doc_uid=doc_uid, c=body.collection, id=body.id, rows=rows)
    if rows:  # with no arguments the document goes straight to done
        events.stage(body.collection, body.id, "classification", arguments=len(rows),
                     skipped_responses=skipped)
    return {"collection": body.collection, "id": body.id, "skipped_responses": skipped,
            # not "arguments": n8n expressions refuse to read a property with that name
            "argument_list": [{"local_id": r["local_id"], "TEXT": r["text"]} for r in rows]}
