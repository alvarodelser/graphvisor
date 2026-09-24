# Sourced by the scripts in services/: loads services/.env and checks keys.
#   . "$(dirname "$0")/../env.sh"; require_env KEY1 KEY2 ...

ENV_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "error: $ENV_FILE not found (copy services/.env.example and fill it in)" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

require_env() {
  local missing=()
  for key in "$@"; do
    [ -n "${!key:-}" ] || missing+=("$key")
  done
  if [ "${#missing[@]}" -gt 0 ]; then
    echo "error: missing in $ENV_FILE: ${missing[*]}" >&2
    exit 1
  fi
}
