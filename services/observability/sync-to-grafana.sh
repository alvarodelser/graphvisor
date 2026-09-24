#!/usr/bin/env bash
# Push the GraphVisor dashboard(s) into IARAG's Grafana (services/observability
# in IARAG), through its HTTP API. IARAG's files are not touched: the dashboard
# lives in its own "GraphVisor" folder, and only dashboards whose uid starts with
# "graphvisor-" are created or updated. Safe to re-run (overwrites our own).
#
# The data comes from IARAG's stack as it is: promtail already ships the logs of
# every container on n8n-net (graphvisor-worker included) to Loki, and
# iarag-metrics already logs the depth of every RabbitMQ queue.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/../env.sh"
require_env GRAFANA_URL GRAFANA_USER GRAFANA_PASSWORD

API="${GRAFANA_URL%/}/api"
AUTH=(-u "$GRAFANA_USER:$GRAFANA_PASSWORD")
FOLDER_UID=graphvisor

code="$(curl -s -o /dev/null -w '%{http_code}' "${AUTH[@]}" "$API/folders/$FOLDER_UID")"
case "$code" in
  200) echo "==> folder GraphVisor exists" ;;
  404) curl -sf "${AUTH[@]}" -H 'content-type: application/json' \
         -d "{\"uid\": \"$FOLDER_UID\", \"title\": \"GraphVisor\"}" "$API/folders" >/dev/null
       echo "==> created folder GraphVisor" ;;
  401|403) echo "error: Grafana rejected $GRAFANA_USER (GRAFANA_USER/GRAFANA_PASSWORD in services/.env)" >&2; exit 1 ;;
  *) echo "error: Grafana at $API answered HTTP $code" >&2; exit 1 ;;
esac

for f in "$HERE"/graphvisor-*.json; do
  python3 - "$f" "$FOLDER_UID" > /tmp/graphvisor-dashboard.$$ <<'PY'
import json, sys
dash = json.load(open(sys.argv[1]))
if not str(dash.get("uid", "")).startswith("graphvisor-"):
    sys.exit(f"refusing {sys.argv[1]}: dashboard uid {dash.get('uid')!r} is not graphvisor-*")
dash["id"] = None
print(json.dumps({"dashboard": dash, "folderUid": sys.argv[2], "overwrite": True,
                  "message": "sync-to-grafana.sh"}))
PY
  answer="$(curl -s "${AUTH[@]}" -H 'content-type: application/json' --data @/tmp/graphvisor-dashboard.$$ "$API/dashboards/db")"
  rm -f /tmp/graphvisor-dashboard.$$
  python3 - "$answer" "$GRAFANA_URL" "$(basename "$f")" <<'PY'
import json, sys
answer, base, name = sys.argv[1], sys.argv[2].rstrip("/"), sys.argv[3]
try:
    data = json.loads(answer)
except ValueError:
    sys.exit(f"error: {name}: unexpected answer {answer[:200]}")
if data.get("status") != "success":
    sys.exit(f"error: {name}: {data.get('message', answer[:200])}")
print(f"==> {name}: version {data['version']}  {base}{data['url'].removeprefix('/logs')}")
PY
done
