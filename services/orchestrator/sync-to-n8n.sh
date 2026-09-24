#!/usr/bin/env bash
# Push the graphvisor_* workflows into the shared n8n container (IARAG's).
#
# Based on IARAG's orchestrator/workflows/sync-to-n8n.sh, reduced to:
#   1. render: inline prompts and env values (render.py) into a local stage dir
#   2. guard:  abort if any of our ids exists on the instance under a name that
#              isn't graphvisor_* (an id collision would overwrite someone else's
#              workflow -- import:workflow matches by id)
#   3. backup: export every workflow on the instance (as IARAG does)
#   4. import: create or update ours, by id; nothing else is touched
#
# It never publishes, activates or restarts anything. import:workflow leaves what
# it imports unpublished, so publish graphvisor_ingest and graphvisor_finalize in
# the n8n UI afterwards; until then messages wait in graphvisor_ingest.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/../env.sh"
require_env N8N_CONTAINER N8N_PROJECT_ID N8N_OLLAMA_CREDENTIAL_ID OLLAMA_MODEL WORKER_URL

CONTAINER="$N8N_CONTAINER"
STAGE_LOCAL="$(mktemp -d)"
STAGE_CONTAINER="/tmp/graphvisor-workflow-import"
trap 'rm -rf "$STAGE_LOCAL"' EXIT

if ! docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
  echo "error: container '$CONTAINER' is not running (N8N_CONTAINER in services/.env)" >&2
  exit 1
fi

echo "==> rendering workflows (prompts + env inlined)"
ours="$(python3 "$HERE/render.py" "$STAGE_LOCAL")"
echo "$ours" | sed 's/^/    /'

echo "==> checking our ids against the instance"
live="$(docker exec -u node "$CONTAINER" n8n list:workflow 2>/dev/null || true)"
while IFS=$'\t' read -r id name; do
  live_name="$(printf '%s\n' "$live" | awk -F'|' -v id="$id" '$1 == id { sub(/^[^|]*\|/, ""); print; exit }')"
  if [ -n "$live_name" ] && [[ "$live_name" != graphvisor_* ]]; then
    echo "error: id $id ($name) already belongs to '$live_name' on the instance; nothing was imported" >&2
    exit 1
  fi
  if [ -n "$live_name" ]; then echo "    update  $name ($id)"; else echo "    create  $name ($id)"; fi
done <<< "$ours"

echo "==> backing up every workflow currently on the instance"
# /data is IARAG's host-mounted storage (survives restarts); fall back to n8n's
# home if an instance has no such volume.
BACKUP_ROOT=/data
docker exec -u node "$CONTAINER" test -w "$BACKUP_ROOT" || BACKUP_ROOT=/home/node/.n8n
BACKUP_CONTAINER="$BACKUP_ROOT/backup-graphvisor-$(date +%F-%H%M%S)"
if [ -z "$live" ]; then
  echo "    instance has no workflows yet; nothing to back up"
else
  docker exec -u node "$CONTAINER" n8n export:workflow --all --separate --output="$BACKUP_CONTAINER" >/dev/null
  echo "    kept at $BACKUP_CONTAINER inside the container"
fi

echo "==> importing"
docker exec -u node "$CONTAINER" rm -rf "$STAGE_CONTAINER"
docker exec -u node "$CONTAINER" mkdir -p "$STAGE_CONTAINER"
for f in "$STAGE_LOCAL"/*.json; do
  docker cp "$f" "$CONTAINER:$STAGE_CONTAINER/$(basename "$f")"
done
docker exec -u node "$CONTAINER" n8n import:workflow --separate --input="$STAGE_CONTAINER" --projectId="$N8N_PROJECT_ID"
docker exec -u node "$CONTAINER" rm -rf "$STAGE_CONTAINER"

echo
echo "==> done. Now publish graphvisor_ingest and graphvisor_finalize in the n8n UI"
echo "    (import leaves them unpublished; graphvisor_start is run by hand)."
