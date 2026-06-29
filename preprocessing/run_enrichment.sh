#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
source .venv/bin/activate
python enrich_citations.py "$@"
python embed.py "$@"
python cluster_topics.py "$@"
