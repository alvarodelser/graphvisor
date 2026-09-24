"""GraphVisor worker: one endpoint per non-LLM pipeline step, plus the read API.
Design: docs/superpowers/specs/2026-09-23-auto-ingestion-design.md §4."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app import api, concepts, diagnose, enrichment, ingest
from app.shared import events, neo4j, vectorizer

events.setup_logging()


@asynccontextmanager
async def lifespan(_app):
    events.start_pollers()  # collection_progress + ollama_status for the dashboard
    yield


app = FastAPI(title="GraphVisor worker", lifespan=lifespan)
app.add_middleware(events.StepEventsMiddleware)
app.include_router(ingest.router)
app.include_router(concepts.router)
app.include_router(enrichment.router)
app.include_router(api.router)
app.include_router(diagnose.router)


@app.get("/health")
def health():
    status = {}
    try:
        neo4j.read("RETURN 1 AS ok")
        status["neo4j"] = "ok"
    except Exception as exc:  # noqa: BLE001 - report any failure
        status["neo4j"] = f"error: {exc}"
    try:
        vectorizer.embed(["health check"])
        status["vectorizer"] = "ok"
    except Exception as exc:  # noqa: BLE001
        status["vectorizer"] = f"error: {exc}"
    ok = all(v == "ok" for v in status.values())
    return JSONResponse(status, status_code=200 if ok else 503)
