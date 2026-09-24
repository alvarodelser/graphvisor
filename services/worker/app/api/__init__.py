"""Read API for GraphVisor."""

from fastapi import APIRouter

from app.api import corpus, search

router = APIRouter()
router.include_router(corpus.router)
router.include_router(search.router)
