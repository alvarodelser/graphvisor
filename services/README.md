# services/

Automated ingestion for GraphVisor: a collection dropped into `input/<collection>/` is processed by n8n, following the old scientific-trend-miner pipeline, into our own Neo4j. GraphVisor reads it from the worker's API.
Design: `docs/superpowers/specs/2026-09-23-auto-ingestion-design.md`. Plan and status: `docs/superpowers/plans/2026-09-23-auto-ingestion.md`.

| Folder | What it is |
|---|---|
| `orchestrator/` | Config for the **existing** n8n: `workflows/graphvisor_{start,ingest,finalize,diagnose}.json`, `prompts/` (the old backend's, verbatim), `render.py` + `sync-to-n8n.sh` |
| `messaging/` | Config for the **existing** RabbitMQ: `queues.json` (`graphvisor_ingest` + `graphvisor_ingest_dlq`, in IARAG's vhost) and `sync-to-rabbit.sh` |
| `graphdb/` | Our **own** Neo4j 5 Community container: `schema.cypher` (constraints, vector indexes), applied automatically on `up` |
| `observability/` | The **GraphVisor Ingestion** dashboard for IARAG's Grafana, and `sync-to-grafana.sh` |
| `worker/` | Our **own** FastAPI service: one endpoint per non-LLM step (`app/ingest`, `app/concepts`, `app/enrichment`) and GraphVisor's read API (`app/api`) |

Shared services from IARAG are used as they are, on docker network `n8n-net`: OCR, chunker, abstraction service, vectorizer, and the `ollama_high` Ollama (gemma4:31b on its own L40), through a GraphVisor n8n credential. Nothing in IARAG is modified. Every script here only touches `graphvisor_*` resources.

## Setup (once, on the server)

```bash
cp services/.env.example services/.env   # fill in RabbitMQ management credentials/vhost, NEO4J_PASSWORD, OPENALEX_MAILTO
```
The workflows reuse n8n's existing "RabbitMQ Credentials". For the LLM they use their own credential, because IARAG's "Ollama account" points at `ollama_low`:

1. Put `ollama_high` on `n8n-net` so n8n and the worker can reach it by name: `docker network connect n8n-net ollama_high`. If the container is ever recreated, run this again.
2. In n8n, **Credentials → Create → Ollama**: name `GraphVisor Ollama`, Base URL `http://ollama_high:11434`, then save. Its id is the last part of the URL, `…/credentials/<id>`.
3. Put that id in `services/.env` as `N8N_OLLAMA_CREDENTIAL_ID`. `sync-to-n8n.sh` writes it into every LLM node.

### Neo4j (first time)

Neo4j is our own container, `graphvisor-neo4j`: bolt on `127.0.0.1:7688`, browser on `127.0.0.1:7475`, and `graphvisor-neo4j:7687` on `n8n-net`.

1. **Choose the password before the first start.** Put it in `services/.env` as `NEO4J_PASSWORD`, for example the output of `openssl rand -base64 24 | tr -d '/+='` (at least 8 characters, letters and digits). Neo4j stores it in its data volume on the first start and ignores the variable after that. To change it later, run `ALTER CURRENT USER SET PASSWORD` in Neo4j, or delete the `graphvisor-neo4j-data` volume, which wipes the graph.
2. **Start it:** `docker compose --env-file services/.env -f services/graphdb/docker-compose.yml up -d`. This also applies the schema (uniqueness constraints and the two vector indexes): a one-shot `graphvisor-neo4j-schema` container waits for Neo4j to be healthy, runs `schema.cypher` and exits. Every statement is `IF NOT EXISTS`, so each `up` is safe.
3. **Check:** `docker logs graphvisor-neo4j-schema` shows no errors and `docker inspect -f '{{.State.ExitCode}}' graphvisor-neo4j-schema` prints `0`. `diagnose.sh` then shows `worker -> neo4j … vector indexes online`. If you edit `schema.cypher`, run the same `up -d` again.

## Deploy / update

```bash
# 1. Neo4j: start the container; the schema (constraints + vector indexes) is applied on up
docker compose --env-file services/.env -f services/graphdb/docker-compose.yml up -d

# 2. Worker: build and start (mounts input/ read-only; checks Neo4j + vectorizer)
docker compose --env-file services/.env -f services/worker/docker-compose.yml up -d --build
curl -s localhost:8090/health

# 3. RabbitMQ: create the graphvisor_* queues (idempotent, never deletes)
services/messaging/sync-to-rabbit.sh

# 4. n8n: back up, then create/update the graphvisor_* workflows with prompts inlined
services/orchestrator/sync-to-n8n.sh

# 5. Check everything end to end (see Diagnose)
services/diagnose.sh

# 6. Grafana: create/update the GraphVisor dashboard (see Monitoring)
services/observability/sync-to-grafana.sh
```
Then, in the n8n UI, **publish `graphvisor_ingest` and `graphvisor_finalize`**. The import leaves them unpublished, and until `graphvisor_ingest` is published, messages wait in the queue. Re-run the matching step after changing a schema, the worker code, the queues, or a workflow or prompt.

## Pipeline, step by step

Who does each step, and what it produces. **LLM** is gemma4:31b through n8n's Ollama node, using the old pipeline's prompts (`orchestrator/prompts/`).

**Start** (`graphvisor_start`, run by hand): the worker lists `input/<collection>/`, deletes whatever the collection had in Neo4j before, and records how many documents to expect. n8n queues one message per document in `graphvisor_ingest`.

**Phase 1: each document** (`graphvisor_ingest`, one at a time)
1. **Worker, load:** for a JSON, it validates it, creates the Document (title, year, DOI, abstract) and rebuilds the text as markdown. For a PDF only, it creates an empty Document.
2. **OCR** (PDF only): n8n downloads the PDF from the worker and gets markdown text back.
3. **Chunker:** n8n gets the text split into chunks, each with its section title.
4. **Worker** saves the chunks. "Abstract"/"Summary" chunks become the abstract.
5. **Abstraction service** (only if there is still no abstract) writes one, and the worker saves it.
6. **LLM, L1:** once per chunk, it lists the claims and arguments.
7. **Worker** embeds the arguments and the abstract (vectorizer), ranks the arguments by similarity to the abstract, and saves them.
8. **LLM, classification:** once per argument, it gives the type (causal, evidence, …), confidence and reasoning. The worker keeps the 6 graph types.
9. **LLM, L2:** once per kept argument, it gives subject–relation–object triples. An invalid answer is asked again, up to 3 times.
10. **Worker** writes the graph: Entities, typed Entity→Entity relations, and Argument→Entity links.
11. **Worker** marks the document done. When the last document is done, n8n starts finalize.

A failure marks the document `failed` (with the step and the error) and puts the message in `graphvisor_ingest_dlq`. The other documents continue. Finalize runs only when **every** document is done. If the last one closes with some failed, the collection becomes `incomplete` and waits for a retry (see *Failures and retries*).

**Phase 2: concepts** (`graphvisor_finalize`, whole collection)
1. **Worker** groups the graph arguments 15 at a time.
2. **LLM, concept constructor:** once per group, it proposes concepts.
3. **LLM, concept validation:** a single call over all proposals, giving the final concept set (retried up to 3 times on invalid JSON).
4. **Worker** saves and embeds the concepts, then links each argument to its 3 closest concepts.

**Phase 3: enrichment** (`graphvisor_finalize`)
1. **Title/year** (PDF-only documents): the worker tries the filename, then OpenAlex, then asks the LLM.
2. **Citations:** the worker asks OpenAlex (by DOI, else by title), with Semantic Scholar as the fallback. This step is best effort.
3. **Document vectors** (title + abstract) and **map positions** (PCA) for documents and concepts, computed by the worker.
4. **Topics:** the worker clusters the documents by concept; the LLM names each topic.

**Phase 4: hypotheses** (`graphvisor_finalize`, as in the old `hypothesis_generation.py`)
1. **Worker** writes, for each concept, the arguments linked to it in batches of 200 (`ARGUMENT_ID` / `ARGUMENT` blocks, as in the old per-concept files).
2. **LLM, hypothesis generation:** once per batch, it proposes hypotheses with research question, rationale, the evidence argument ids, and scores for novelty, plausibility, impact and creativity (0–1). Invalid answers are asked again, up to 3 times.
3. **Worker** stores Hypothesis nodes, linked to their concept (`ABOUT`) and evidence arguments (`EVIDENCED_BY`), and marks the collection `ready`.

**Viewing:** GraphVisor starts on a collection screen and opens a ready collection as `?collection=<name>`. Discover lists its hypotheses. Explore opens once a hypothesis is selected, or straight from the document selection when a collection has none. Search bars: corpus view (titles by words, arguments by meaning), Explore (entities by words, arguments by meaning).

## Diagnose

```bash
services/diagnose.sh
```
One read-only report, with one PASS/FAIL/WARN line per check, and a non-zero exit if a required check fails. It checks:
- **host:** our containers are running and on `n8n-net`; both queues exist, and `graphvisor_ingest` has its consumer (it warns if `graphvisor_ingest` isn't published); all four workflows are imported.
- **worker** (`GET /diagnose`): Neo4j and its schema; the vectorizer (1024-d, normalized vectors, similar texts closer than unrelated ones); the input folder; OpenAlex; Semantic Scholar (optional, often rate-limited).
- **n8n side** (the `graphvisor_diagnose` workflow): n8n reaches the worker; OCR reads a sample PDF back; the chunker splits markdown on titles; the abstraction service returns an abstract; Ollama/gemma4 answers valid JSON under a system prompt.

The n8n part runs `n8n execute` inside the n8n container, on its own task-broker port. You can also run `graphvisor_diagnose` by hand from the n8n UI; its *Report* node shows the same results.

## Monitoring

GraphVisor reuses IARAG's observability stack (`IARAG/services/observability`) as it is. Promtail already ships the logs of every container on `n8n-net` to Loki, including `graphvisor-worker`. `iarag-metrics` already logs the depth of every RabbitMQ queue, ours included. The worker logs JSON events for the dashboard:

| Event | When | Fields |
|---|---|---|
| `document_stage` | a document enters a stage; repeated every minute while it stays there | `doc_id`, `stage`, `stage_code` (1 prepare … 6 done, 7 failed) |
| `document_done` / `document_failed` | a document closes | seconds per stage (`prepare_s`, `abstract_s`, `l1_s`, `classification_s`, `l2_s`, `total_s`), chunks, arguments, entities, `failed_step` |
| `worker_step` | every pipeline request | `step`, `doc_id`, `status`, `duration_ms` |
| `collection_progress` | every minute | status, expected/done/failed, arguments, entities, concepts, topics |
| `ollama_status` | every minute | model loaded on `OLLAMA_STATUS_URL` and `gpu_percent` (`level=error` at 0%, i.e. running on the CPU) |

`services/observability/sync-to-grafana.sh` pushes `graphvisor-ingestion.json` into a **GraphVisor** folder through Grafana's API (`GRAFANA_URL`, `GRAFANA_USER` and `GRAFANA_PASSWORD` in `services/.env`). IARAG's files are not touched, and only `graphvisor-*` dashboards are written. The dashboard is at `https://wiig.dia.fi.upm.es/logs/d/graphvisor-ingestion`:
- **Document progress:** one row per document, coloured by stage over time (prepare → abstraction → L1 → classification → L2 → done). Hover a segment for when it started and how long it took.
- **Time per stage:** a stacked bar per finished document.
- **Collections table**, done and failed counts, and the average time per document.
- **Pipeline model on GPU:** turns red if gemma4 falls back to the CPU.
- Worker steps per minute, queue depth and consumers, and OCR/chunker/abstraction durations for our documents.
- Worker warnings and errors, the GraphVisor lines in the n8n logs, and a full trace for one `doc_id` (set it at the top).

## Run a collection

1. Put the documents in `input/<collection>/` (see `input/README.md`). For the PMC corpus: `python3 input/sci_corpus/fetch_corpus.py`.
2. In n8n, open **graphvisor_start**, set `collection` in the *Collection* node, and execute it.
3. Watch progress on the Grafana dashboard, or with `./collection.sh status <collection>`. The status becomes `ready` when finalize ends.
4. Starting a collection again re-ingests it from scratch. To re-run only the documents that failed, use `collection.sh`.

### Failures and retries

```bash
cd services
./collection.sh status   sci_corpus                        # counts, each failed document with its step and error, queue consumers
./collection.sh retry    sci_corpus                        # queue every failed document again
./collection.sh retry    sci_corpus PMC10425213 PMC10443253   # or only these
./collection.sh finalize sci_corpus                        # finalize without the documents that still fail
```
- **retry** works at any time, including mid-ingestion. The worker marks the documents `queued`, so they count neither as done nor as failed and finalize waits for them. The script then publishes them on `graphvisor_ingest` and removes their messages from the DLQ, keeping a backup in `/tmp`. When the last one is done, finalize starts by itself. On a `ready` collection, retrying re-runs finalize once they're done.
- **finalize** is for documents that will never work, such as a broken PDF. It accepts the current failures and queues a finalize request behind whatever is still in the queue. A later retry takes the acceptance back.
- **status** also checks that `graphvisor_ingest` has exactly **1** consumer. With 2 or more, a leftover n8n listener is running documents in parallel. Unpublish `graphvisor_ingest`, close the extra connection in the RabbitMQ UI, publish again, and check again after every `sync-to-n8n.sh`.
- The script talks to the worker at `WORKER_HOST_URL` (default `http://127.0.0.1:8090`) and to RabbitMQ with the `RABBITMQ_*` settings in `services/.env`.

## GraphVisor

GraphVisor reads `/graphvisor/api/*` (see *Viewing* above for which collection it shows).
- **Development:** `npm run dev`. Vite proxies `/graphvisor/api` to the worker on `localhost:8090` (override with `GRAPHVISOR_WORKER`).
- **Production:** whatever serves `dist/` must proxy `/graphvisor/api/` to `http://graphvisor-worker:8000/api/` (or `127.0.0.1:8090/api/`). The API must be on the same origin as the page, because the login is a same-site cookie. Only `/api/*` goes through that proxy; the pipeline endpoints (called by n8n on n8n-net) are not exposed.
- **Local http:** the session cookie is `Secure`. Chrome and Firefox accept it on `http://localhost`; for Safari, or any other plain-http host, run the worker with `SESSION_COOKIE_SECURE=false`.

### Accounts and access codes

Every page needs a login. People create their own account on the login screen with an **access code**:
- **Admin codes** give every collection, including future ones, plus the Admin panel.
- **Evaluator codes** give the collections chosen for that code.

A person can add more codes later from their menu. Accounts, codes, sessions and ratings live in Neo4j with no `collection` property, so starting a collection again keeps them. Passwords are stored only as Argon2id hashes, and codes only as hashes: a code is shown once, when it's created.

The first admin code comes from the worker's CLI. After that, everything is in GraphVisor under *your name ▾ → Admin*:
```bash
docker exec graphvisor-worker python -m app.manage create-code --label "OEG admins" --role admin
docker exec graphvisor-worker python -m app.manage create-code --label "Lab X" --role evaluator --collections sci_corpus
docker exec graphvisor-worker python -m app.manage list-codes
docker exec graphvisor-worker python -m app.manage disable-code <uid>
docker exec graphvisor-worker python -m app.manage set-password <email>   # prints a temporary password
```
- **Access codes:** create, show once and copy; edit a code's collections (this applies to everyone who used it); regenerate (issues a new code for later sign-ups); disable (removes its access).
- **People:** reset a password (they pick a new one at the next login); block (logs them out everywhere).
- **Collections:** the *blind share*, meaning the fraction of hypotheses whose model scores each person sees only after rating (default 25%, fixed per person). Also *Download ratings* as JSON (also `GET /api/admin/evaluations?collection=`).

### Ratings

- **Discover:** each hypothesis gets a verdict (Promising / Unsure / Not useful). The person can then adjust the four scores, which start from the model's, and add a comment. Blind hypotheses start with empty scores and a blurred radar ("Rate to reveal").
- **Explore:** clicking an argument opens its card, which asks whether it's faithful to the paper, with its source passage. *Faithful* offers a closer check in Detail. *Wrong* opens Detail and asks what's wrong: reasons, a ✓/✗ for each relation and entity, and comments.
- Each person has one rating per item, and saving again updates it. The rating keeps a copy of the rated text.
- Implicit signals go to Loki as `ui_event`: views, filter changes, search picks, copied hypotheses, "explore evidence". Ratings go to Loki as `evaluation`.

## Tests

```bash
cd services/worker
uv venv -p 3.11 .venv && uv pip install -p .venv -r requirements-dev.txt
.venv/bin/pytest                                   # unit tests; Neo4j tests are skipped
NEO4J_URI=bolt://localhost:7688 NEO4J_PASSWORD=... .venv/bin/pytest   # + integration tests against graphdb
.venv/bin/pytest ../orchestrator/test_render.py   # prompt rendering and sync guards
```
The integration tests use the `smoke` collection name and `@smoke.test` accounts, and delete both afterwards.
