#!/usr/bin/env bash
# Declare the queues in queues.json on the shared RabbitMQ (IARAG's vhost),
# through the management API. Idempotent: PUT creates a queue or leaves an
# identical one alone. Only graphvisor_* queues are touched; nothing is deleted.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/../env.sh"
require_env RABBITMQ_API_URL RABBITMQ_USER RABBITMQ_PASS RABBITMQ_VHOST

VHOST_ENC="$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$RABBITMQ_VHOST")"
API="${RABBITMQ_API_URL%/}/api"

python3 - "$HERE/queues.json" <<'PY' > /tmp/graphvisor-queues.$$
import json, sys
for q in json.load(open(sys.argv[1]))["queues"]:
    if not q["name"].startswith("graphvisor_"):
        sys.exit(f"refusing queue {q['name']!r}: not graphvisor_*")
    body = {k: q[k] for k in ("durable", "auto_delete", "arguments")}
    print(q["name"], json.dumps(body))
PY

while read -r name body; do
  code="$(curl -s -o /tmp/graphvisor-rabbit-resp.$$ -w '%{http_code}' -u "$RABBITMQ_USER:$RABBITMQ_PASS" \
    -X PUT -H 'content-type: application/json' -d "$body" "$API/queues/$VHOST_ENC/$name")"
  case "$code" in
    201|204) echo "    ok       $name" ;;
    *) echo "error: $name -> HTTP $code: $(cat /tmp/graphvisor-rabbit-resp.$$)" >&2
       rm -f /tmp/graphvisor-*.$$; exit 1 ;;
  esac
done < /tmp/graphvisor-queues.$$
rm -f /tmp/graphvisor-*.$$

echo "==> graphvisor_* queues in vhost $RABBITMQ_VHOST:"
curl -s -u "$RABBITMQ_USER:$RABBITMQ_PASS" "$API/queues/$VHOST_ENC?columns=name,messages,consumers" \
  | python3 -c '
import json, sys
for q in json.load(sys.stdin):
    if q["name"].startswith("graphvisor_"):
        print("    %s: %s messages, %s consumers" % (q["name"], q.get("messages", 0), q.get("consumers", 0)))
'
