// GraphVisor schema. Idempotent: every statement is IF NOT EXISTS.
// Applied on every `docker compose up` by the graphvisor-neo4j-schema container. Model: docs/superpowers/specs/2026-09-23-auto-ingestion-design.md §5.
//
// Community edition has no composite node keys, so every node carries a
// single `uid` that already includes its collection:
//   Collection  <collection>
//   Document    <collection>:<doc id>
//   Chunk       <collection>:<doc id>:<index>
//   Argument    <collection>:<doc id>:<local id>
//   Entity      <collection>:<name>
//   Concept     <collection>:<name>
//   Topic       <collection>:<topic id>

CREATE CONSTRAINT collection_uid IF NOT EXISTS FOR (n:Collection) REQUIRE n.uid IS UNIQUE;
CREATE CONSTRAINT document_uid IF NOT EXISTS FOR (n:Document) REQUIRE n.uid IS UNIQUE;
CREATE CONSTRAINT chunk_uid IF NOT EXISTS FOR (n:Chunk) REQUIRE n.uid IS UNIQUE;
CREATE CONSTRAINT argument_uid IF NOT EXISTS FOR (n:Argument) REQUIRE n.uid IS UNIQUE;
CREATE CONSTRAINT entity_uid IF NOT EXISTS FOR (n:Entity) REQUIRE n.uid IS UNIQUE;
CREATE CONSTRAINT concept_uid IF NOT EXISTS FOR (n:Concept) REQUIRE n.uid IS UNIQUE;
CREATE CONSTRAINT topic_uid IF NOT EXISTS FOR (n:Topic) REQUIRE n.uid IS UNIQUE;

CREATE INDEX document_collection IF NOT EXISTS FOR (n:Document) ON (n.collection);
CREATE INDEX argument_collection IF NOT EXISTS FOR (n:Argument) ON (n.collection);
CREATE INDEX entity_collection IF NOT EXISTS FOR (n:Entity) ON (n.collection);
CREATE INDEX concept_collection IF NOT EXISTS FOR (n:Concept) ON (n.collection);
CREATE INDEX topic_collection IF NOT EXISTS FOR (n:Topic) ON (n.collection);

// BGE-M3 vectors (1024-d, cosine). Queried with db.index.vector.queryNodes,
// then filtered on `collection` (Community has no in-index filtering).
CREATE VECTOR INDEX concept_embedding IF NOT EXISTS
FOR (n:Concept) ON n.embedding
OPTIONS {indexConfig: {`vector.dimensions`: 1024, `vector.similarity_function`: 'cosine'}};

CREATE VECTOR INDEX document_embedding IF NOT EXISTS
FOR (n:Document) ON n.embedding
OPTIONS {indexConfig: {`vector.dimensions`: 1024, `vector.similarity_function`: 'cosine'}};
