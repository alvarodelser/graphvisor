"""Neo4j access. Every node carries a collection-prefixed `uid` (graphdb/schema.cypher)."""

from functools import lru_cache
from typing import Any

from neo4j import Driver, GraphDatabase

from app.shared.config import settings


@lru_cache
def driver() -> Driver:
    s = settings()
    return GraphDatabase.driver(s.neo4j_uri, auth=(s.neo4j_user, s.neo4j_password))


def read(cypher: str, **params: Any) -> list[dict]:
    records, _, _ = driver().execute_query(cypher, params, routing_="r")
    return [r.data() for r in records]


def write(cypher: str, **params: Any) -> list[dict]:
    records, _, _ = driver().execute_query(cypher, params)
    return [r.data() for r in records]


def uid(collection: str, *parts: Any) -> str:
    return ":".join([collection, *(str(p) for p in parts)])
