"""Graph helpers shared by the per-document ingest steps."""

from fastapi import HTTPException

from app.shared import neo4j


def require_document(collection: str, doc_id: str) -> dict:
    rows = neo4j.read(
        "MATCH (d:Document {uid: $uid}) RETURN d {.*, embedding: null, text: null} AS d",
        uid=neo4j.uid(collection, doc_id))
    if not rows:
        raise HTTPException(404, f"document {collection}/{doc_id} not loaded")
    return rows[0]["d"]


def clear_arguments(collection: str, doc_id: str) -> None:
    """Remove a document's arguments and everything L2 hung off them, so a
    re-run of save_L1_arguments starts clean. Entities left without any
    argument are removed too."""
    neo4j.write(
        """
        MATCH (d:Document {uid: $uid})-[:HAS_ARGUMENT]->(a:Argument)
        OPTIONAL MATCH ()-[r {argument_uid: a.uid}]->()
        DELETE r
        WITH DISTINCT a
        DETACH DELETE a
        """,
        uid=neo4j.uid(collection, doc_id))
    delete_orphan_entities(collection)


def delete_orphan_entities(collection: str) -> None:
    neo4j.write(
        """
        MATCH (e:Entity {collection: $collection})
        WHERE NOT (e)<-[:HAS_SUBJECT|HAS_OBJECT]-()
        DETACH DELETE e
        """,
        collection=collection)
