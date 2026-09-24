"""Structured events for IARAG's observability stack.

Every line the worker prints is JSON, like IARAG's own services: promtail picks
up the logs of every container on n8n-net, turns the `level` field into a label
and ships them to Loki, where the GraphVisor Grafana dashboard queries them
(services/observability/). Events:

  worker_step          one per request: step, collection, doc_id, status, duration_ms
  document_done/failed one per document: seconds spent in each stage, counts
  collection_progress  every minute per collection: status, counters, graph sizes
  ollama_status        every minute: models loaded on the pipeline's Ollama and
                       how much of each is on the GPU (level=error when 0%)
  log                  anything logged through Python's logging
"""

import fcntl
import json
import logging
import os
import threading
import time
from datetime import datetime, timezone

import httpx

SERVICE = "graphvisor-worker"
QUIET_PATHS = ("/health", "/api/", "/diagnose", "/docs", "/openapi.json")
_print_lock = threading.Lock()


def emit(event: str, level: str = "info", **fields) -> None:
    line = {"ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds"), "level": level,
            "event": event, "service_name": SERVICE, **fields}
    with _print_lock:
        print(json.dumps(line, ensure_ascii=False, default=str), flush=True)


class _JSONLogHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:  # noqa: A003 - logging API
        level = {"WARNING": "warning", "ERROR": "error", "CRITICAL": "error"}.get(record.levelname, "info")
        emit("log", level=level, logger=record.name, message=record.getMessage())


def setup_logging() -> None:
    root = logging.getLogger()
    root.handlers = [_JSONLogHandler()]
    root.setLevel(logging.INFO)
    # uvicorn's plain-text access lines duplicate worker_step.
    logging.getLogger("uvicorn.access").disabled = True


# ------------------------------------------------------------ per request

class StepEventsMiddleware:
    """ASGI middleware: one worker_step event per pipeline request. Reads the
    JSON body (and replays it to the app) to find collection and document."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["path"].startswith(QUIET_PATHS):
            return await self.app(scope, receive, send)
        start, chunks, more = time.monotonic(), [], True
        while more:
            message = await receive()
            chunks.append(message.get("body", b""))
            more = message.get("more_body", False)
        body = b"".join(chunks)
        replayed = False

        async def replay():
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()

        status = {"code": 500}

        async def capture(message):
            if message["type"] == "http.response.start":
                status["code"] = message["status"]
            await send(message)

        try:
            await self.app(scope, replay, capture)
        finally:
            collection, doc = _refs(scope, body)
            code = status["code"]
            route = scope.get("route")
            emit("worker_step", level="error" if code >= 500 else "warning" if code >= 400 else "info",
                 step=getattr(route, "name", None) or scope["path"], method=scope["method"],
                 path=scope["path"], status=code, duration_ms=round((time.monotonic() - start) * 1000),
                 collection=collection, doc_id=f"{collection}:{doc}" if collection and doc else None)


def _refs(scope, body: bytes) -> tuple:
    params = scope.get("path_params") or {}
    collection, doc = params.get("collection"), params.get("doc_id")
    if body[:1] == b"{":
        try:
            data = json.loads(body)
            collection, doc = data.get("collection", collection), data.get("id", doc)
        except (ValueError, AttributeError):
            pass
    return collection, doc


# ------------------------------------------------------------ per document

# What a document is doing *now*, logged whenever it enters a new stage. The
# dashboard's state timeline draws one row per document with these as colored
# segments; the code is what Loki can unwrap into a plottable number.
STAGE_CODES = {
    "prepare": 1,          # OCR (PDF only) + chunker, in n8n
    "abstraction": 2,      # abstraction service
    "l1_extraction": 3,    # LLM, one call per chunk
    "classification": 4,   # LLM, one call per argument
    "l2_entities": 5,      # LLM, one call per graph argument (+ retries)
    "done": 6,
    "failed": 7,
}


def stage(collection: str, doc_id: str, name: str, **fields) -> None:
    """Log that a document entered a stage, and remember it on the Document so
    the poller can repeat it every minute until the next one (the timeline
    then draws the current stage up to now instead of stopping at the event)."""
    from app.shared import neo4j  # late import: neo4j doesn't depend on this module
    code = STAGE_CODES[name]
    neo4j.write("MATCH (d:Document {uid: $uid}) SET d.stage = $name, d.stage_code = $code",
                uid=neo4j.uid(collection, doc_id), name=name, code=code)
    emit("document_stage", level="error" if name == "failed" else "info", collection=collection,
         doc_id=f"{collection}:{doc_id}", stage=name, stage_code=code, **fields)


# Stage timestamps (epoch ms) set on the Document by each ingest step.
STAGES = ["loaded_at", "chunked_at", "abstract_at", "l1_at", "classified_at", "l2_at"]


def stage_seconds(times: dict, closed_at: int) -> dict:
    """Seconds between consecutive stages that happened. The LLM stages (l1,
    classification, l2) are almost all gemma4 time; prepare is OCR + chunker."""
    t = {k: times.get(k) for k in STAGES}
    out = {}

    def span(name, begin, end):
        if begin is not None and end is not None:
            out[name] = round((end - begin) / 1000, 1)

    span("prepare_s", t["loaded_at"], t["chunked_at"])
    span("abstract_s", t["chunked_at"], t["abstract_at"])
    span("l1_s", t["abstract_at"] or t["chunked_at"], t["l1_at"])
    span("classification_s", t["l1_at"], t["classified_at"])
    span("l2_s", t["classified_at"], t["l2_at"])
    span("total_s", t["loaded_at"], closed_at)
    return out


# ------------------------------------------------------------ pollers

POLL_INTERVAL_S = int(os.environ.get("EVENTS_POLL_INTERVAL_S", "60"))
_LOCK_PATH = "/tmp/graphvisor-events-poller.lock"


def poll_collections() -> None:
    from app.shared import neo4j  # late import: tests stub the driver
    rows = neo4j.read(
        """
        MATCH (c:Collection)
        CALL (c) {
          OPTIONAL MATCH (a:Argument {collection: c.uid, in_graph: true}) RETURN count(a) AS arguments }
        CALL (c) {
          OPTIONAL MATCH (e:Entity {collection: c.uid}) RETURN count(e) AS entities }
        CALL (c) {
          OPTIONAL MATCH (k:Concept {collection: c.uid}) RETURN count(k) AS concepts }
        CALL (c) {
          OPTIONAL MATCH (t:Topic {collection: c.uid}) RETURN count(t) AS topics }
        RETURN c.uid AS collection, c.status AS status, c.expected AS expected, c.done AS done,
               c.failed AS failed, arguments, entities, concepts, topics
        """)
    for r in rows:
        emit("collection_progress", level="error" if r["status"] == "failed" else "info", **r)
    for d in neo4j.read("MATCH (d:Document {status: 'processing'}) WHERE d.stage_code IS NOT NULL "
                        "RETURN d.collection AS collection, d.uid AS doc_id, d.stage AS stage, "
                        "d.stage_code AS stage_code"):
        emit("document_stage", heartbeat=True, **d)


def poll_ollama() -> None:
    url = os.environ.get("OLLAMA_STATUS_URL", "").rstrip("/")
    if not url:
        return
    try:
        models = httpx.get(f"{url}/api/ps", timeout=10).json().get("models", [])
    except (httpx.HTTPError, ValueError) as exc:
        emit("ollama_status", level="error", url=url, error=f"{type(exc).__name__}: {exc}", loaded=0)
        return
    if not models:
        emit("ollama_status", url=url, loaded=0)
    for m in models:
        size, vram = m.get("size") or 0, m.get("size_vram") or 0
        gpu_percent = round(100 * vram / size) if size else 0
        emit("ollama_status", level="error" if gpu_percent == 0 else "info", url=url, loaded=1,
             model=m.get("name"), size_gb=round(size / 1e9, 1), gpu_percent=gpu_percent,
             expires_at=m.get("expires_at"))


def start_pollers() -> None:
    """One poller per container: uvicorn runs several worker processes, and only
    the one that gets the lock polls."""
    handle = open(_LOCK_PATH, "w")  # noqa: SIM115 - held for the process lifetime
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        handle.close()
        return

    def loop():
        while True:
            for poll in (poll_collections, poll_ollama):
                try:
                    poll()
                except Exception as exc:  # noqa: BLE001 - a poller must never die
                    emit("poller_error", level="error", poller=poll.__name__, error=str(exc))
            time.sleep(POLL_INTERVAL_S)

    threading.Thread(target=loop, name="events-poller", daemon=True).start()
    start_pollers.lock = handle  # keep the lock alive
