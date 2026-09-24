# services/

Automated ingestion for GraphVisor: a collection dropped into `input/<collection>/` is processed by n8n, following the old scientific-trend-miner pipeline, into our own Neo4j. GraphVisor reads it from the worker's API.
Design: `docs/superpowers/specs/2026-09-23-auto-ingestion-design.md`. Plan and status: `docs/superpowers/plans/2026-09-23-auto-ingestion.md`.

| Folder | What it is |
|---|---|
| `orchestrator/` | Config for the **existing** n8n: `workflows/graphvisor_{start,ingest,finalize,diagnose}.json`, `prompts/` (the old backend's, verbatim), `render.py` + `sync-to-n8n.sh` |
| `messaging/` | Config for the **existing** RabbitMQ: `queues.json` (`graphvisor_ingest` + `graphvisor_ingest_dlq`, in IARAG's vhost) and `sync-to-rabbit.sh` |
| `graphdb/` | Our **own** Neo4j 5 Community container: `schema.cypher` (constraints, vector indexes) and `apply-schema.sh` |
| `worker/` | Our **own** FastAPI service: one endpoint per non-LLM step (`app/ingest`, `app/concepts`, `app/enrichment`) and GraphVisor's read API (`app/api`) |

Shared services from IARAG are used as they are, on docker network `n8n-net`: OCR, chunker, abstraction service, vectorizer, and Ollama (through n8n's "Ollama account" credential). Nothing in IARAG is modified. Every script here only touches `graphvisor_*` resources.

## Setup (once, on the server)

```bash
cp services/.env.example services/.env   # fill in RabbitMQ management credentials/vhost, NEO4J_PASSWORD, OPENALEX_MAILTO
```
The workflows reuse the existing n8n credentials "RabbitMQ Credentials" and "Ollama account"; nothing to create in n8n.

## Deploy / update

```bash
# 1. Neo4j: start the container, apply constraints + vector indexes
docker compose --env-file services/.env -f services/graphdb/docker-compose.yml up -d
services/graphdb/apply-schema.sh

# 2. Worker: build and start (mounts input/ read-only; checks Neo4j + vectorizer)
docker compose --env-file services/.env -f services/worker/docker-compose.yml up -d --build
curl -s localhost:8090/health

# 3. RabbitMQ: create the graphvisor_* queues (idempotent, never deletes)
services/messaging/sync-to-rabbit.sh

# 4. n8n: back up, then create/update the graphvisor_* workflows with prompts inlined
services/orchestrator/sync-to-n8n.sh

# 5. Check everything end to end (see Diagnose)
services/diagnose.sh
```
Then, in the n8n UI, **publish `graphvisor_ingest` and `graphvisor_finalize`**. The import leaves them unpublished, and until `graphvisor_ingest` is published, messages wait in the queue. Re-run the matching step after changing a schema, the worker code, the queues, or a workflow or prompt.

## Diagnose

```bash
services/diagnose.sh
```
One read-only report, with one PASS/FAIL/WARN line per check, and a non-zero exit if a required check fails. It checks:
- **host:** our containers are running and on `n8n-net`; both queues exist, and `graphvisor_ingest` has its consumer (it warns if `graphvisor_ingest` isn't published); all four workflows are imported.
- **worker** (`GET /diagnose`): Neo4j and its schema; the vectorizer (1024-d, normalized vectors, similar texts closer than unrelated ones); the input folder; OpenAlex; Semantic Scholar (optional, often rate-limited).
- **n8n side** (the `graphvisor_diagnose` workflow): n8n reaches the worker; OCR reads a sample PDF back; the chunker splits markdown on titles; the abstraction service returns an abstract; Ollama/gemma4 answers valid JSON under a system prompt.

The n8n part runs `n8n execute` inside the n8n container, on its own task-broker port. You can also run `graphvisor_diagnose` by hand from the n8n UI; its *Report* node shows the same results.

## Run a collection

1. Put the documents in `input/<collection>/` (see `input/README.md`). For the PMC corpus: `python3 input/sci_corpus/fetch_corpus.py`.
2. In n8n, open **graphvisor_start**, set `collection` in the *Collection* node, and execute it.
3. Watch progress: `curl -s localhost:8090/api/collections`. It shows done and failed counts against expected; the status becomes `ready` when finalize ends.
4. Failed documents are in `graphvisor_ingest_dlq`. Each message says which step failed and why, and the same information is on the `Document` node (`status: failed`, `failed_step`, `error`). Starting a collection again re-ingests it from scratch.

## GraphVisor

GraphVisor reads `/graphvisor/api/*` and shows the first ready collection, or `?collection=<name>`. A picker in the status bar switches between collections.
- **Development:** `npm run dev`. Vite proxies `/graphvisor/api` to the worker on `localhost:8090` (override with `GRAPHVISOR_WORKER`).
- **Production:** whatever serves `dist/` must proxy `/graphvisor/api/` to `http://graphvisor-worker:8000/api/` (or `127.0.0.1:8090/api/`), or build with `VITE_GRAPHVISOR_API` set to the API's URL.

## Tests

```bash
cd services/worker
uv venv -p 3.11 .venv && uv pip install -p .venv -r requirements-dev.txt
.venv/bin/pytest                                   # unit tests; Neo4j tests are skipped
NEO4J_URI=bolt://localhost:7688 NEO4J_PASSWORD=... .venv/bin/pytest   # + integration tests against graphdb
.venv/bin/pytest ../orchestrator/test_render.py   # prompt rendering and sync guards
```
The integration tests use the `smoke` collection name and delete it afterwards.
