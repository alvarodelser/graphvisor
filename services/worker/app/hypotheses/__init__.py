"""Phase 4: hypotheses per collection (graphvisor_finalize)."""

from fastapi import APIRouter

from app.hypotheses import hypothesis_seeds, save_hypotheses

router = APIRouter(tags=["hypotheses"])
router.include_router(hypothesis_seeds.router)
router.include_router(save_hypotheses.router)
