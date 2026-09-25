"""/api/auth: sign-up (with an access code), login, logout, who am I,
redeeming another code, changing the password."""

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from app.auth import service
from app.auth.deps import CSRF_HEADER, current_user
from app.shared import events
from app.shared.config import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])


class SignUpIn(BaseModel):
    name: str
    email: str
    password: str
    code: str


class LoginIn(BaseModel):
    email: str
    password: str


class CodeIn(BaseModel):
    code: str


class PasswordIn(BaseModel):
    current: str | None = None
    new: str


def _csrf(request: Request) -> None:
    if request.headers.get(CSRF_HEADER) != "1":
        raise HTTPException(403, "missing X-GraphVisor header")


def _set_session(response: Response, uid: str) -> None:
    s = settings()
    response.set_cookie(s.session_cookie, service.start_session(uid), max_age=s.session_days * 86400,
                        path=s.session_cookie_path, httponly=True, secure=s.session_cookie_secure, samesite="lax")


@router.post("/signup", dependencies=[Depends(_csrf)])
def sign_up(body: SignUpIn, response: Response):
    user = service.sign_up(body.name, body.email, body.password, body.code)
    _set_session(response, user["uid"])
    events.emit("auth", action="signup", user=user["uid"])
    return service.access_of(user["uid"])


@router.post("/login", dependencies=[Depends(_csrf)])
def log_in(body: LoginIn, response: Response):
    try:
        user = service.log_in(body.email, body.password)
    except HTTPException as exc:
        events.emit("auth", level="warning", action="login_failed", status=exc.status_code)
        raise
    _set_session(response, user["uid"])
    events.emit("auth", action="login", user=user["uid"])
    return service.access_of(user["uid"])


@router.post("/logout", dependencies=[Depends(_csrf)])
def log_out(request: Request, response: Response):
    s = settings()
    token = request.cookies.get(s.session_cookie)
    if token:
        service.end_session(token)
    response.delete_cookie(s.session_cookie, path=s.session_cookie_path)
    return {"ok": True}


@router.get("/me")
def me(user: dict = Depends(current_user)):
    return user


@router.post("/redeem")
def redeem(body: CodeIn, user: dict = Depends(current_user)):
    service.redeem(user["uid"], body.code)
    return service.access_of(user["uid"])


@router.post("/password")
def change_password(body: PasswordIn, user: dict = Depends(current_user)):
    service.change_password(user["uid"], body.current, body.new)
    return {"ok": True}
