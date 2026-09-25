#!/usr/bin/env bash
# Publish / unpublish the graphvisor_* workflows through n8n's REST API.
#
#   ./workflows.sh status                      published or not, and graphvisor_ingest's consumers
#   ./workflows.sh unpublish [name...]         default: graphvisor_ingest graphvisor_finalize
#   ./workflows.sh publish   [name...]         default: graphvisor_finalize graphvisor_ingest
#
# Through the API, not n8n's CLI: the running n8n starts and stops the RabbitMQ
# listener itself, where CLI changes only apply after an n8n restart. Each
# command then checks the queue: 0 consumers after unpublishing, exactly 1
# after publishing. A consumer left after unpublishing is a listener n8n lost
# track of; only restarting n8n removes it.
#
# Needs N8N_API_KEY in services/.env (n8n > Settings > n8n API > Create an API key).
# N8N_API_URL defaults to n8n on the host (http://127.0.0.1:5678/api/v1, or /n8n/api/v1).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/../env.sh"
require_env N8N_API_KEY

# name -> id, from the workflow files (ids never change)
wf_id() {
  python3 - "$HERE/workflows" "$1" <<'PY'
import json, pathlib, sys
for f in pathlib.Path(sys.argv[1]).glob("*.json"):
    w = json.loads(f.read_text())
    if w["name"] == sys.argv[2]:
        print(w["id"]); break
else:
    sys.exit(f"error: no workflow named {sys.argv[2]!r} in {sys.argv[1]}")
PY
}

api_base() {
  local candidates base code
  if [ -n "${N8N_API_URL:-}" ]; then candidates="${N8N_API_URL%/}"
  else candidates="http://127.0.0.1:5678/api/v1 http://127.0.0.1:5678/n8n/api/v1"; fi
  for base in $candidates; do
    code="$(curl -s -o /dev/null -w '%{http_code}' -H "X-N8N-API-KEY: $N8N_API_KEY" "$base/workflows?limit=1" || true)"
    case "$code" in
      200) echo "$base"; return 0 ;;
      401|403) echo "error: n8n rejected N8N_API_KEY ($base)" >&2; return 1 ;;
    esac
  done
  echo "error: n8n's API not reachable (tried: $candidates). Set N8N_API_URL in services/.env." >&2
  return 1
}

n8n() {  # n8n METHOD PATH -> body; fails on non-2xx
  local out code
  out="$(mktemp)"
  code="$(curl -s -o "$out" -w '%{http_code}' -X "$1" -H "X-N8N-API-KEY: $N8N_API_KEY" \
    -H 'content-type: application/json' "$BASE$2")"
  if [ "${code:0:1}" != 2 ]; then
    echo "error: n8n $1 $2 -> HTTP $code: $(head -c 300 "$out")" >&2; rm -f "$out"; return 1
  fi
  cat "$out"; rm -f "$out"
}

is_published() {
  n8n GET "/workflows/$(wf_id "$1")" | python3 -c 'import json, sys; print(str(json.load(sys.stdin).get("active", False)).lower())'
}

consumers() {  # graphvisor_ingest's consumer count, or "?" when RabbitMQ can't be asked
  if [ -z "${RABBITMQ_API_URL:-}" ] || [ -z "${RABBITMQ_USER:-}" ]; then echo "?"; return; fi
  local vh
  vh="$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "${RABBITMQ_VHOST:-/}")"
  curl -s -u "$RABBITMQ_USER:${RABBITMQ_PASS:-}" "${RABBITMQ_API_URL%/}/api/queues/$vh/graphvisor_ingest" \
    | python3 -c 'import json, sys
try: print(json.load(sys.stdin).get("consumers", 0))
except ValueError: print("?")'
}

wait_consumers() {  # wait_consumers WANT SECONDS: RabbitMQ's figures lag ~5 s
  local want="$1" left="$2" n
  while :; do
    n="$(consumers)"
    [ "$n" = "$want" ] || [ "$n" = "?" ] && { echo "$n"; return; }
    [ "$left" -le 0 ] && { echo "$n"; return; }
    sleep 3; left=$((left - 3))
  done
}

CMD="${1:-status}"; shift || true
BASE="$(api_base)"

case "$CMD" in
  status)
    for name in graphvisor_ingest graphvisor_finalize graphvisor_start graphvisor_diagnose; do
      printf '    %-22s %s\n' "$name" "$([ "$(is_published "$name")" = true ] && echo published || echo unpublished)"
    done
    echo "    graphvisor_ingest consumers: $(consumers)"
    ;;

  unpublish)
    [ $# -gt 0 ] || set -- graphvisor_ingest graphvisor_finalize   # the listener first
    for name in "$@"; do
      if [ "$(is_published "$name")" = true ]; then
        n8n POST "/workflows/$(wf_id "$name")/deactivate" >/dev/null && echo "    unpublished $name"
      else
        echo "    $name was already unpublished"
      fi
    done
    case " $* " in *" graphvisor_ingest "*)
      n="$(wait_consumers 0 30)"
      if [ "$n" = "?" ]; then echo "    warning: can't check graphvisor_ingest's consumers (RABBITMQ_* in services/.env)" >&2
      elif [ "$n" != 0 ]; then
        echo "error: graphvisor_ingest still has $n consumer(s) with the workflow unpublished: a listener" >&2
        echo "       n8n lost track of. Restart n8n (docker restart ${N8N_CONTAINER:-n8n}; check IARAG isn't" >&2
        echo "       mid-run), then run this again." >&2
        exit 1
      else echo "    graphvisor_ingest: 0 consumers"; fi ;;
    esac
    ;;

  publish)
    [ $# -gt 0 ] || set -- graphvisor_finalize graphvisor_ingest   # what ingest calls, first
    case " $* " in *" graphvisor_ingest "*)
      n="$(consumers)"
      if [ "$n" != "?" ] && [ "$n" != 0 ] && [ "$(is_published graphvisor_ingest)" != true ]; then
        echo "error: graphvisor_ingest already has $n consumer(s) while unpublished: publishing would add" >&2
        echo "       another. Restart n8n first (docker restart ${N8N_CONTAINER:-n8n})." >&2
        exit 1
      fi ;;
    esac
    for name in "$@"; do
      if [ "$(is_published "$name")" = true ]; then
        echo "    $name was already published"
      else
        n8n POST "/workflows/$(wf_id "$name")/activate" >/dev/null && echo "    published $name"
      fi
    done
    case " $* " in *" graphvisor_ingest "*)
      n="$(wait_consumers 1 30)"
      if [ "$n" = "?" ]; then echo "    warning: can't check graphvisor_ingest's consumers (RABBITMQ_* in services/.env)" >&2
      elif [ "$n" != 1 ]; then
        echo "error: graphvisor_ingest has $n consumer(s), expected 1." >&2
        [ "$n" -gt 1 ] 2>/dev/null && echo "       A leftover listener runs documents in parallel: unpublish, restart n8n, publish." >&2
        exit 1
      else echo "    graphvisor_ingest: 1 consumer"; fi ;;
    esac
    ;;

  *) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
