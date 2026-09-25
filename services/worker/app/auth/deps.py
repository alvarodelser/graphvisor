"""Request guards for the read API.

Every /api route needs a logged-in user; routes under /api/collections/{c}
also need access to that collection (a 404, so collection names don't leak).
Writes must carry the X-GraphVisor header, which other sites' pages can't set
on a cross-site request, on top of the SameSite session cookie."""

from fastapi import Depends, HTTPException, Request

from app.auth import service
from app.shared.config import settings

CSRF_HEADER = "x-graphvisor"


def current_user(request: Request) -> dict:
    token = request.cookies.get(settings().session_cookie)
    uid = service.session_user(token) if token else None
    if not uid:
        raise HTTPException(401, "not logged in")
    if request.method not in ("GET", "HEAD", "OPTIONS") and request.headers.get(CSRF_HEADER) != "1":
        raise HTTPException(403, "missing X-GraphVisor header")
    return service.access_of(uid)


def collection_user(collection: str, user: dict = Depends(current_user)) -> dict:
    if not service.can_access(user, collection):
        raise HTTPException(404, f"no collection {collection}")
    return user


def admin_user(user: dict = Depends(current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(403, "admins only")
    return user
