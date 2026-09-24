"""Phase 3: corpus enrichment per collection (graphvisor_finalize)."""

from fastapi import APIRouter

from app.enrichment import citations, concept_grounding, doc_embedding, metadata, ready, topics

router = APIRouter(tags=["enrichment"])
for module in (metadata, citations, doc_embedding, concept_grounding, topics, ready):
    router.include_router(module.router)
