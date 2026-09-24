#!/usr/bin/env bash
# One diagnostic for the whole ingestion setup: is every service reachable, and
# does it answer the way the pipeline expects? Prints one PASS/FAIL line per
# check and exits non-zero if a required check fails. Read-only: nothing is
# published, written to the graph, or restarted.
#
#   host      containers up and on n8n-net, RabbitMQ queues (and their consumer),
#             our workflows imported in n8n
#   worker    GET /diagnose: Neo4j + schema, vectorizer, input folder, OpenAlex,
#             Semantic Scholar (optional)
#   n8n       the graphvisor_diagnose workflow, run from n8n's side of n8n-net:
#             worker, OCR on a sample PDF, chunker, abstraction service, and
#             Ollama (gemma4) answering JSON under a system prompt
#
# The n8n part runs `n8n execute` inside the n8n container, on its own task
# broker port so it doesn't clash with the running instance. The same checks can
# be run by hand from the UI: open graphvisor_diagnose and execute it.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/env.sh"
require_env N8N_CONTAINER RABBITMQ_API_URL RABBITMQ_USER RABBITMQ_PASS RABBITMQ_VHOST

WORKER_HOST_URL="${WORKER_HOST_URL:-http://127.0.0.1:8090}"
DIAGNOSE_WORKFLOW_ID=GvDiagnose000001
WORKFLOW_IDS="GvStart000000001 GvIngest00000001 GvFinalize000001 $DIAGNOSE_WORKFLOW_ID"
failures=0
report() {  # report <ok|fail|warn> <check> <detail>
  case "$1" in
    ok)   printf '  PASS  %-44s %s\n' "$2" "$3" ;;
    warn) printf '  WARN  %-44s %s\n' "$2" "$3" ;;
    *)    printf '  FAIL  %-44s %s\n' "$2" "$3"; failures=$((failures + 1)) ;;
  esac
}

echo "== host"
for c in graphvisor-neo4j graphvisor-worker "$N8N_CONTAINER"; do
  if docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null | grep -q true; then
    nets="$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$c")"
    if [[ " $nets " == *" n8n-net "* ]]; then report ok "container $c" "running, on n8n-net"
    else report fail "container $c" "running but not on n8n-net (networks: $nets)"; fi
  else
    report fail "container $c" "not running"
  fi
done

VHOST_ENC="$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$RABBITMQ_VHOST")"
rabbit_lines="$(for q in graphvisor_ingest graphvisor_ingest_dlq; do
  body="$(curl -s -u "$RABBITMQ_USER:$RABBITMQ_PASS" "${RABBITMQ_API_URL%/}/api/queues/$VHOST_ENC/$q")"
  python3 - "$q" "$body" <<'PY'
import json, sys
name, body = sys.argv[1], sys.argv[2]
try:
    q = json.loads(body)
except ValueError:
    print(f"fail\trabbitmq queue {name}\tmanagement API unreachable or bad answer: {body[:120]}"); sys.exit()
if "name" not in q:
    print(f"fail\trabbitmq queue {name}\tmissing: run services/messaging/sync-to-rabbit.sh"); sys.exit()
msgs, consumers = q.get("messages", 0), q.get("consumers", 0)
if name == "graphvisor_ingest":
    if q.get("arguments", {}).get("x-consumer-timeout") != 21600000:
        print(f"fail\trabbitmq queue {name}\tno 6 h x-consumer-timeout (declared by someone else?)")
    elif consumers == 0:
        print(f"warn\trabbitmq queue {name}\t{msgs} messages, no consumer: publish graphvisor_ingest in n8n")
    else:
        print(f"ok\trabbitmq queue {name}\t{msgs} messages, {consumers} consumer(s)")
else:
    print(f"{'warn' if msgs else 'ok'}\trabbitmq queue {name}\t{msgs} failed document(s) waiting")
PY
done)"
while IFS=$'\t' read -r status check detail; do report "$status" "$check" "$detail"; done \
  < <(printf '%s\n' "$rabbit_lines")

live="$(docker exec -u node "$N8N_CONTAINER" n8n list:workflow 2>/dev/null)"
for id in $WORKFLOW_IDS; do
  name="$(printf '%s\n' "$live" | awk -F'|' -v id="$id" '$1 == id { print $2 }')"
  if [ -n "$name" ]; then report ok "n8n workflow $id" "$name"
  else report fail "n8n workflow $id" "not on the instance: run services/orchestrator/sync-to-n8n.sh"; fi
done

print_checks() {  # JSON report {"ok", "checks": [...]} on stdin -> report lines
  python3 -c '
import json, sys
for c in json.load(sys.stdin).get("checks", []):
    status = "ok" if c["ok"] else ("fail" if c.get("required", True) else "warn")
    ms = " (%s ms)" % c["ms"] if "ms" in c else ""
    print("%s\t%s\t%s%s" % (status, c["check"], c["detail"], ms))'
}

echo "== worker (from the host)"
if body="$(curl -sf --max-time 300 "$WORKER_HOST_URL/diagnose")"; then
  while IFS=$'\t' read -r status check detail; do report "$status" "$check" "$detail"; done \
    < <(printf '%s' "$body" | print_checks)
else
  report fail "worker $WORKER_HOST_URL/diagnose" "unreachable"
fi

echo "== n8n side (graphvisor_diagnose; OCR, abstraction and gemma4 can take a few minutes)"
raw="$(docker exec -u node -e N8N_RUNNERS_BROKER_PORT=5690 "$N8N_CONTAINER" \
        n8n execute --id="$DIAGNOSE_WORKFLOW_ID" 2>&1)"
n8n_report="$(printf '%s' "$raw" | python3 -c '
import json, sys
text = sys.stdin.read()
start = text.find("\n{")  # the execution JSON follows the CLI log lines
try:
    data = json.loads(text[start + 1:] if start >= 0 else text)
    item = data["data"]["resultData"]["runData"]["Report"][0]["data"]["main"][0][0]["json"]
    print(json.dumps(item))
except Exception:
    print(json.dumps({"ok": False, "checks": [{"check": "n8n execute graphvisor_diagnose", "ok": False,
          "detail": text.strip().splitlines()[-1][:200] if text.strip() else "no output"}]}))')"
while IFS=$'\t' read -r status check detail; do report "$status" "$check" "$detail"; done \
  < <(printf '%s' "$n8n_report" | print_checks)

echo
if [ "$failures" -eq 0 ]; then echo "All required checks passed."; else echo "$failures required check(s) failed."; fi
exit $(( failures > 0 ))
