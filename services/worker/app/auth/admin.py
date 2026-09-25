"""/api/admin (admins only): access codes, users, per-collection settings."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth import service
from app.auth.deps import admin_user
from app.shared import neo4j
from app.shared.config import settings

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(admin_user)])


class NewCodeIn(BaseModel):
    label: str
    role: str
    collections: list[str] = []


class CodeUpdateIn(BaseModel):
    label: str | None = None
    collections: list[str] | None = None
    disabled: bool | None = None


class UserUpdateIn(BaseModel):
    blocked: bool


class SettingsIn(BaseModel):
    blind_fraction: float


@router.get("/codes")
def codes():
    return service.list_codes()


@router.post("/codes")
def new_code(body: NewCodeIn):
    code, record = service.create_code(body.label, body.role, body.collections)
    return {**record, "code": code}  # the only time the plain code is shown


@router.patch("/codes/{uid}")
def update_code(uid: str, body: CodeUpdateIn):
    return service.update_code(uid, body.label, body.collections, body.disabled)


@router.post("/codes/{uid}/regenerate")
def regenerate(uid: str):
    return {"uid": uid, "code": service.regenerate_code(uid)}


@router.get("/users")
def users():
    return service.list_users()


@router.post("/users/{uid}/reset-password")
def reset_password(uid: str):
    return {"uid": uid, "temporary_password": service.reset_password(uid)}


@router.patch("/users/{uid}")
def update_user(uid: str, body: UserUpdateIn):
    service.set_blocked(uid, body.blocked)
    return {"uid": uid, "blocked": body.blocked}


def blind_fraction(collection: str) -> float:
    rows = neo4j.read("MATCH (s:CollectionSettings {name: $c}) RETURN s.blind_fraction AS f", c=collection)
    return rows[0]["f"] if rows and rows[0]["f"] is not None else settings().default_blind_fraction


@router.get("/collections/{collection}/settings")
def get_settings(collection: str):
    return {"collection": collection, "blind_fraction": blind_fraction(collection)}


@router.put("/collections/{collection}/settings")
def put_settings(collection: str, body: SettingsIn):
    # CollectionSettings has `name`, not `collection`: re-ingesting keeps it
    neo4j.write("MERGE (s:CollectionSettings {name: $c}) SET s.blind_fraction = $f",
                c=collection, f=min(1.0, max(0.0, body.blind_fraction)))
    return get_settings(collection)
