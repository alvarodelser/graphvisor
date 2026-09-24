"""Phase 1: per-document steps (graphvisor_ingest)."""

from fastapi import APIRouter

from app.ingest import (done, load, pdf, save_abstract, save_chunks, save_classification,
                        save_L1_arguments, save_L2_entities, start)

router = APIRouter(tags=["ingest"])
for module in (start, load, pdf, save_chunks, save_abstract, save_L1_arguments,
               save_classification, save_L2_entities, done):
    router.include_router(module.router)
