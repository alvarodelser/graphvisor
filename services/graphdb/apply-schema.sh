#!/usr/bin/env bash
# Apply schema.cypher to the graphvisor-neo4j container. Safe to re-run.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/../env.sh"
require_env NEO4J_PASSWORD

CONTAINER=graphvisor-neo4j
if ! docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
  echo "error: $CONTAINER is not running (see services/README.md)" >&2
  exit 1
fi

docker exec -i "$CONTAINER" cypher-shell -u neo4j -p "$NEO4J_PASSWORD" < "$HERE/schema.cypher"
echo "==> constraints and indexes now on the server:"
docker exec -i "$CONTAINER" cypher-shell -u neo4j -p "$NEO4J_PASSWORD" --format plain \
  "SHOW INDEXES YIELD name, type, labelsOrTypes, properties RETURN name, type, labelsOrTypes, properties ORDER BY name"
