"""Phase 2: concepts per collection (graphvisor_finalize)."""

from fastapi import APIRouter

from app.concepts import (argument_concept_linking, concept_batches, concept_indexing,
                          save_concept_candidates, save_concepts)

router = APIRouter(tags=["concepts"])
for module in (concept_batches, save_concept_candidates, save_concepts, concept_indexing,
               argument_concept_linking):
    router.include_router(module.router)
