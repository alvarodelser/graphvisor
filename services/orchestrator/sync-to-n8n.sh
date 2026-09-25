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
# It never imports while graphvisor_ingest has a consumer: importing over a
# published workflow leaves the old version's RabbitMQ listener running inside
# n8n, where unpublishing can't reach it (it keeps reconnecting and ingesting in
# parallel until n8n restarts). FORCE=1 skips that check.
#
# With N8N_API_KEY in services/.env it unpublishes graphvisor_ingest and
# graphvisor_finalize first (workflows.sh, through n8n's API), imports, and
# publishes again whatever was published before (--publish: publish both anyway,
# --no-publish: leave them unpublished). It never restarts n8n.
# Without the key it only imports; import:workflow leaves what it imports
# unpublished, so publish them in the n8n UI (or ./workflows.sh publish).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/../env.sh"
require_env N8N_CONTAINER N8N_PROJECT_ID N8N_OLLAMA_CREDENTIAL_ID OLLAMA_MODEL WORKER_URL

PUBLISH=restore
case "${1:-}" in
  --publish) PUBLISH=all ;;
  --no-publish) PUBLISH=none ;;
  "") ;;
  *) echo "usage: $0 [--publish | --no-publish]" >&2; exit 2 ;;
esac
WF="$HERE/workflows.sh"

CONTAINER="$N8N_CONTAINER"
STAGE_LOCAL="$(mktemp -d)"
STAGE_CONTAINER="/tmp/graphvisor-workflow-import"
trap 'rm -rf "$STAGE_LOCAL"' EXIT

if ! docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
  echo "error: container '$CONTAINER' is not running (N8N_CONTAINER in services/.env)" >&2
  exit 1
fi

echo "==> checking that graphvisor_ingest is unpublished"
WAS_PUBLISHED=""
if [ -n "${N8N_API_KEY:-}" ] && [ "${FORCE:-0}" != 1 ]; then
  for name in graphvisor_ingest graphvisor_finalize; do
    if "$WF" status | grep -qE "^ +$name +published"; then WAS_PUBLISHED="$WAS_PUBLISHED $name"; fi
  done
  echo "    published now:${WAS_PUBLISHED:- none}"
  "$WF" unpublish graphvisor_ingest graphvisor_finalize   # exits if a leftover listener remains
elif [ "${FORCE:-0}" = 1 ]; then
  echo "    skipped (FORCE=1)"
elif [ -n "${RABBITMQ_API_URL:-}" ] && [ -n "${RABBITMQ_USER:-}" ]; then
  vh="$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "${RABBITMQ_VHOST:-/}")"
  consumers="$(curl -s -u "$RABBITMQ_USER:${RABBITMQ_PASS:-}" "${RABBITMQ_API_URL%/}/api/queues/$vh/graphvisor_ingest" \
    | python3 -c 'import json, sys
try: print(json.load(sys.stdin).get("consumers", 0))
except ValueError: print("?")')"
  if [ "$consumers" = "?" ]; then
    echo "    warning: RabbitMQ management API not reachable; can't check" >&2
  elif [ "$consumers" != 0 ]; then
    echo "error: graphvisor_ingest has $consumers consumer(s): unpublish graphvisor_ingest in n8n first." >&2
    echo "       If it's unpublished and a consumer remains, a leftover listener is running inside n8n:" >&2
    echo "       restart n8n (docker restart $CONTAINER), check again, then sync. Nothing was imported." >&2
    exit 1
  else
    echo "    ok (0 consumers)"
  fi
else
  echo "    warning: RABBITMQ_* not set in services/.env; can't check" >&2
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
if [ -z "${N8N_API_KEY:-}" ]; then
  echo "==> done. Now publish graphvisor_ingest and graphvisor_finalize in the n8n UI"
  echo "    (import leaves them unpublished; graphvisor_start is run by hand)."
  exit 0
fi
case "$PUBLISH" in
  all) TO_PUBLISH="graphvisor_finalize graphvisor_ingest" ;;
  none) TO_PUBLISH="" ;;
  restore)  # finalize before ingest: ingest calls it
    TO_PUBLISH=""
    case "$WAS_PUBLISHED" in *graphvisor_finalize*) TO_PUBLISH="graphvisor_finalize" ;; esac
    case "$WAS_PUBLISHED" in *graphvisor_ingest*) TO_PUBLISH="$TO_PUBLISH graphvisor_ingest" ;; esac ;;
esac
if [ -n "${TO_PUBLISH// /}" ]; then
  echo "==> publishing again:$TO_PUBLISH"
  # shellcheck disable=SC2086
  "$WF" publish $TO_PUBLISH
else
  echo "==> done; left unpublished. Publish with: services/orchestrator/workflows.sh publish"
fi
