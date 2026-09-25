"""Accounts, access codes and sessions."""

from fastapi import APIRouter

from app.auth import admin, routes

router = APIRouter()
router.include_router(routes.router)
router.include_router(admin.router)
