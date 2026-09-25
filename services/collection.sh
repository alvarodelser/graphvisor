#!/usr/bin/env bash
# Failed documents of a collection, from the host:
#
#   ./collection.sh status   <collection>          counts, failed documents (step, error), queue consumers
#   ./collection.sh retry    <collection> [id...]  queue the failed documents (or only these) again
#   ./collection.sh finalize <collection>          finalize without the documents that still fail
#
# Finalize runs only when every document is done. A collection whose last
# document closes with failures becomes `incomplete` and waits for one of these.
# retry marks the documents `queued` in the worker (so finalize waits for them),
# publishes them on graphvisor_ingest and removes their messages from the DLQ.
# finalize accepts the current failures and queues a finalize request behind
# whatever is still in graphvisor_ingest.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/env.sh"
require_env RABBITMQ_API_URL RABBITMQ_USER RABBITMQ_PASS RABBITMQ_VHOST

WORKER="${WORKER_HOST_URL:-http://127.0.0.1:8090}"
API="${RABBITMQ_API_URL%/}/api"
VH="$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$RABBITMQ_VHOST")"
AUTH="$RABBITMQ_USER:$RABBITMQ_PASS"

usage() { sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }
[ $# -ge 2 ] || usage
CMD="$1"; COLLECTION="$2"; shift 2

worker() {  # worker METHOD PATH [JSON]
  local out code
  out="$(mktemp)"
  code="$(curl -s -o "$out" -w '%{http_code}' -X "$1" -H 'content-type: application/json' \
    -d "${3:-}" "$WORKER$2")" || { echo "error: worker not reachable at $WORKER" >&2; rm -f "$out"; exit 1; }
  if [ "$code" != 200 ]; then echo "error: $1 $2 -> HTTP $code: $(cat "$out")" >&2; rm -f "$out"; exit 1; fi
  cat "$out"; rm -f "$out"
}

publish() {  # publish QUEUE JSON_PAYLOAD -> prints true/false
  local body
  body="$(python3 -c 'import json, sys; print(json.dumps({"properties": {"delivery_mode": 2},
    "routing_key": sys.argv[1], "payload": sys.argv[2], "payload_encoding": "string"}))' "$1" "$2")"
  curl -s -u "$AUTH" -H 'content-type: application/json' -X POST \
    "$API/exchanges/$VH/amq.default/publish" -d "$body" \
    | python3 -c 'import json, sys; print(str(json.load(sys.stdin).get("routed", False)).lower())' 2>/dev/null \
    || echo false
}

consumers() {
  curl -s -u "$AUTH" "$API/queues/$VH/graphvisor_ingest" | python3 -c '
import json, sys
try:
    q = json.load(sys.stdin)
except ValueError:
    sys.exit("    warning: RabbitMQ management API not reachable: queue state unknown")
n = q.get("consumers", 0)
print("    graphvisor_ingest: %s ready, %s in progress, %s consumer(s)" % (
    q.get("messages_ready", 0), q.get("messages_unacknowledged", 0), n))
if n != 1:
    print("    warning: expected exactly 1 consumer (graphvisor_ingest published once in n8n);"
          " 0 = nothing is ingesting, 2+ = a leftover listener runs documents in parallel")'
}

# Remove the DLQ messages of these documents, keeping everyone else's.
drop_from_dlq() {  # drop_from_dlq ID...
  local backup
  backup="${TMPDIR:-/tmp}/graphvisor-dlq-$(date +%Y%m%dT%H%M%S).json"
  curl -s -u "$AUTH" -H 'content-type: application/json' -X POST "$API/queues/$VH/graphvisor_ingest_dlq/get" \
    -d '{"count":10000,"ackmode":"ack_requeue_false","encoding":"auto"}' > "$backup"
  python3 - "$backup" "$COLLECTION" "$@" <<'PY' | while IFS= read -r payload; do
import json, sys
path, collection, ids = sys.argv[1], sys.argv[2], set(sys.argv[3:])
for m in json.load(open(path)):
    try:
        body = json.loads(m["payload"])
    except (ValueError, TypeError):
        body = {}
    if body.get("collection") == collection and body.get("id") in ids:
        continue
    print(m["payload"])       # someone else's: goes back
PY
    [ "$(publish graphvisor_ingest_dlq "$payload")" = true ] || echo "warning: could not put a DLQ message back (see $backup)" >&2
  done
  echo "    DLQ cleaned (previous content saved in $backup)"
}

case "$CMD" in
  status)
    worker GET "/collections/$COLLECTION/failures" | python3 -c '
import json, sys
f = json.load(sys.stdin)
stage = f.get("stage") if f.get("stage") not in (None, f["status"]) else None
print("==> %s: %s%s" % (f["collection"], f["status"], " (stage %s)" % stage if stage else ""))
print("    %s expected: %s" % (f["expected"], ", ".join("%s %s" % (n, s) for s, n in sorted(f["documents"].items()))))
if f["accept_failures"]:
    print("    failures accepted: finalize goes ahead without them")
for d in f["failures"]:
    print("    FAILED %-14s %-18s %s" % (d["id"], d["step"] or "", (d["error"] or "").replace("\n", " ")[:110]))
if f["failures"]:
    print("\n    retry: ./collection.sh retry %s    finalize without them: ./collection.sh finalize %s"
          % (f["collection"], f["collection"]))'
    consumers
    ;;

  retry)
    IDS_JSON="$(python3 -c 'import json, sys; print(json.dumps({"ids": sys.argv[1:]}))' "$@")"
    RESULT="$(worker POST "/collections/$COLLECTION/retry" "$IDS_JSON")"
    python3 -c 'import json, sys; r = json.loads(sys.argv[1])
print("==> %s: %d document(s) queued again" % (r["collection"], len(r["queued"])))
if r["not_failed"]: print("    skipped (not failed): " + " ".join(r["not_failed"]))' "$RESULT"
    QUEUED="$(python3 -c 'import json, sys; print(" ".join(json.loads(sys.argv[1])["queued"]))' "$RESULT")"
    [ -n "$QUEUED" ] || exit 0
    PUBLISHED=""; LOST=""
    for id in $QUEUED; do   # ids match ID_PATTERN: no spaces
      msg="$(python3 -c 'import json, sys; print(json.dumps({"collection": sys.argv[1], "id": sys.argv[2]}))' "$COLLECTION" "$id")"
      if [ "$(publish graphvisor_ingest "$msg")" = true ]; then echo "    queued   $id"; PUBLISHED="$PUBLISHED $id"
      else LOST="$LOST $id"; fi
    done
    if [ -n "$LOST" ]; then
      # Not on the queue: mark them failed again so the counts stay right and a later retry finds them.
      for id in $LOST; do
        worker POST /documents/failed "$(python3 -c 'import json, sys; print(json.dumps({"collection": sys.argv[1],
          "id": sys.argv[2], "step": "retry", "error": "could not publish the retry message"}))' "$COLLECTION" "$id")" >/dev/null
        echo "error: could not publish $id; it is marked failed again" >&2
      done
    fi
    # shellcheck disable=SC2086
    [ -z "$PUBLISHED" ] || drop_from_dlq $PUBLISHED
    consumers
    ;;

  finalize)
    worker POST "/collections/$COLLECTION/accept-failures" | python3 -c 'import json, sys; r = json.load(sys.stdin)
print("==> %s: finalizing without %d failed document(s)" % (r["collection"], r["accepted_failures"]))'
    msg="$(python3 -c 'import json, sys; print(json.dumps({"collection": sys.argv[1], "action": "finalize"}))' "$COLLECTION")"
    [ "$(publish graphvisor_ingest "$msg")" = true ] || { echo "error: could not publish the finalize request" >&2; exit 1; }
    echo "    finalize request queued behind the documents still in graphvisor_ingest"
    consumers
    ;;

  *) usage ;;
esac
