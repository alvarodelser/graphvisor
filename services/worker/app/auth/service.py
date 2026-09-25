"""Accounts, access codes and sessions, stored in Neo4j.

  (:AccessCode {uid, label, code_hash, code_hint, role, collections, created_at, disabled_at})
  (:User {uid, email, name, password_hash, must_change_password, blocked, created_at,
          last_login_at, failed_logins, locked_until})-[:REDEEMED {at}]->(:AccessCode)
  (:Session {token_hash, created_at, expires_at})-[:OF]->(:User)

A user's access is computed from the codes they redeemed, on every request:
admin if any enabled code is an admin code; otherwise the union of those codes'
collections ("*" = all, including future ones). Collections are kept by name
(not as graph links) so re-ingesting a collection doesn't drop anyone's access.
None of these nodes has a `collection` property, so starting a collection
again never deletes them.
"""

import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from app.shared import neo4j, security
from app.shared.config import settings

ROLES = ("admin", "evaluator")
ALL = "*"
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MIN_PASSWORD = 8


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uid(prefix: str) -> str:
    return f"{prefix}-{secrets.token_hex(6)}"


# ------------------------------------------------------------------ codes

def create_code(label: str, role: str, collections: list[str]) -> tuple[str, dict]:
    if role not in ROLES:
        raise HTTPException(422, f"role must be one of {ROLES}")
    collections = [ALL] if role == "admin" else sorted(set(collections))
    if not collections:
        raise HTTPException(422, "an evaluator code needs at least one collection (or '*')")
    code = security.new_code()
    rows = neo4j.write(
        """
        CREATE (k:AccessCode {uid: $uid, label: $label, code_hash: $hash, code_hint: $hint, role: $role,
                              collections: $collections, created_at: datetime()})
        RETURN k {.uid, .label, .role, .collections, .code_hint} AS k
        """,
        uid=_uid("code"), label=label.strip() or "unnamed", hash=security.code_hash(code),
        hint=security.normalize_code(code)[-4:], role=role, collections=collections)
    return code, rows[0]["k"]


def find_code(code: str) -> dict | None:
    rows = neo4j.read("MATCH (k:AccessCode {code_hash: $h}) WHERE k.disabled_at IS NULL RETURN k {.*} AS k",
                      h=security.code_hash(code))
    return rows[0]["k"] if rows else None


def regenerate_code(uid: str) -> str:
    code = security.new_code()
    rows = neo4j.write("MATCH (k:AccessCode {uid: $uid}) SET k.code_hash = $h, k.code_hint = $hint RETURN k.uid AS uid",
                       uid=uid, h=security.code_hash(code), hint=security.normalize_code(code)[-4:])
    if not rows:
        raise HTTPException(404, "no such access code")
    return code


def update_code(uid: str, label: str | None = None, collections: list[str] | None = None,
                disabled: bool | None = None) -> dict:
    rows = neo4j.read("MATCH (k:AccessCode {uid: $uid}) RETURN k.role AS role", uid=uid)
    if not rows:
        raise HTTPException(404, "no such access code")
    if collections is not None and rows[0]["role"] == "admin":
        collections = [ALL]
    rows = neo4j.write(
        """
        MATCH (k:AccessCode {uid: $uid})
        SET k.label = coalesce($label, k.label),
            k.collections = coalesce($collections, k.collections),
            k.disabled_at = CASE WHEN $disabled IS NULL THEN k.disabled_at
                                 WHEN $disabled THEN coalesce(k.disabled_at, datetime()) ELSE null END
        RETURN k {.uid, .label, .role, .collections, .code_hint, disabled: k.disabled_at IS NOT NULL} AS k
        """,
        uid=uid, label=label, collections=sorted(set(collections)) if collections is not None else None,
        disabled=disabled)
    return rows[0]["k"]


def list_codes() -> list[dict]:
    return [r["k"] for r in neo4j.read(
        """
        MATCH (k:AccessCode) OPTIONAL MATCH (u:User)-[:REDEEMED]->(k)
        WITH k, count(u) AS users
        RETURN k {.uid, .label, .role, .collections, .code_hint, users: users,
                  disabled: k.disabled_at IS NOT NULL, created_at: toString(k.created_at)} AS k
        ORDER BY k.created_at
        """)]


# ------------------------------------------------------------------ users

def _check_password(password: str) -> None:
    if len(password) < MIN_PASSWORD:
        raise HTTPException(422, f"the password needs at least {MIN_PASSWORD} characters")


def sign_up(name: str, email: str, password: str, code: str) -> dict:
    email = email.strip().lower()
    if not EMAIL.match(email):
        raise HTTPException(422, "that doesn't look like an email address")
    if not name.strip():
        raise HTTPException(422, "a name is needed")
    _check_password(password)
    access = find_code(code)
    if not access:
        raise HTTPException(403, "that access code isn't valid")
    if neo4j.read("MATCH (u:User {email: $e}) RETURN u.uid AS uid", e=email):
        raise HTTPException(409, "an account with that email already exists: log in instead")
    uid = _uid("user")
    neo4j.write(
        """
        MATCH (k:AccessCode {uid: $code})
        CREATE (u:User {uid: $uid, email: $email, name: $name, password_hash: $hash,
                        must_change_password: false, blocked: false, failed_logins: 0, created_at: datetime(),
                        last_login_at: datetime()})
        CREATE (u)-[:REDEEMED {at: datetime()}]->(k)
        """,
        code=access["uid"], uid=uid, email=email, name=name.strip(), hash=security.hash_password(password))
    return {"uid": uid}


def log_in(email: str, password: str) -> dict:
    """The same error for an unknown email and a wrong password; accounts lock
    for a few minutes after repeated failures."""
    s = settings()
    rows = neo4j.read("MATCH (u:User {email: $e}) RETURN u {.*} AS u", e=email.strip().lower())
    refused = HTTPException(401, "wrong email or password")
    if not rows:
        security.verify_password(security.hash_password("x" * 12), password)  # same work either way
        raise refused
    user = rows[0]["u"]
    if user.get("blocked"):
        raise HTTPException(403, "this account has been disabled")
    locked = user.get("locked_until")
    if locked and locked.to_native() > _now():
        raise HTTPException(429, "too many failed attempts: try again in a few minutes")
    if not security.verify_password(user["password_hash"], password):
        failures = (user.get("failed_logins") or 0) + 1
        lock = _now() + timedelta(minutes=s.login_lock_minutes) if failures >= s.login_max_failures else None
        neo4j.write("MATCH (u:User {uid: $uid}) SET u.failed_logins = $f, u.locked_until = $lock",
                    uid=user["uid"], f=0 if lock else failures, lock=lock)
        raise refused
    neo4j.write("MATCH (u:User {uid: $uid}) SET u.failed_logins = 0, u.locked_until = null, "
                "u.last_login_at = datetime()", uid=user["uid"])
    return user


def change_password(uid: str, current: str | None, new: str) -> None:
    _check_password(new)
    rows = neo4j.read("MATCH (u:User {uid: $uid}) RETURN u.password_hash AS h, u.must_change_password AS m", uid=uid)
    if not rows:
        raise HTTPException(404, "no such user")
    if not rows[0]["m"] and not security.verify_password(rows[0]["h"], current or ""):
        raise HTTPException(403, "the current password is wrong")
    neo4j.write("MATCH (u:User {uid: $uid}) SET u.password_hash = $h, u.must_change_password = false",
                uid=uid, h=security.hash_password(new))


def redeem(uid: str, code: str) -> None:
    access = find_code(code)
    if not access:
        raise HTTPException(403, "that access code isn't valid")
    neo4j.write("MATCH (u:User {uid: $uid}), (k:AccessCode {uid: $k}) MERGE (u)-[r:REDEEMED]->(k) "
                "ON CREATE SET r.at = datetime()", uid=uid, k=access["uid"])


def access_of(uid: str) -> dict:
    rows = neo4j.read(
        """
        MATCH (u:User {uid: $uid})
        OPTIONAL MATCH (u)-[:REDEEMED]->(k:AccessCode) WHERE k.disabled_at IS NULL
        RETURN u {.uid, .email, .name, .must_change_password} AS user,
               collect(DISTINCT k.role) AS roles, collect(k.collections) AS lists
        """,
        uid=uid)
    if not rows:
        raise HTTPException(401, "no such user")
    r = rows[0]
    collections = sorted({c for lst in r["lists"] for c in lst})
    admin = "admin" in r["roles"]
    return {**r["user"], "role": "admin" if admin else "evaluator",
            "collections": [ALL] if admin or ALL in collections else collections}


def can_access(access: dict, collection: str) -> bool:
    return ALL in access["collections"] or collection in access["collections"]


def list_users() -> list[dict]:
    rows = neo4j.read(
        """
        MATCH (u:User)
        OPTIONAL MATCH (u)-[:REDEEMED]->(k:AccessCode)
        OPTIONAL MATCH (e:Evaluation)-[:BY]->(u)
        WITH u, collect(DISTINCT k.label) AS codes, count(DISTINCT e) AS ratings
        RETURN u {.uid, .email, .name, .blocked, codes: codes, ratings: ratings,
                  created_at: toString(u.created_at), last_login_at: toString(u.last_login_at)} AS u
        ORDER BY u.created_at
        """)
    return [{**r["u"], "role": access_of(r["u"]["uid"])["role"]} for r in rows]


def reset_password(uid: str) -> str:
    temporary = security.new_code().replace("GV-", "").lower()
    rows = neo4j.write("MATCH (u:User {uid: $uid}) SET u.password_hash = $h, u.must_change_password = true, "
                       "u.failed_logins = 0, u.locked_until = null RETURN u.uid AS uid",
                       uid=uid, h=security.hash_password(temporary))
    if not rows:
        raise HTTPException(404, "no such user")
    end_sessions(uid)
    return temporary


def set_blocked(uid: str, blocked: bool) -> None:
    if not neo4j.write("MATCH (u:User {uid: $uid}) SET u.blocked = $b RETURN u.uid AS uid", uid=uid, b=blocked):
        raise HTTPException(404, "no such user")
    if blocked:
        end_sessions(uid)


# ------------------------------------------------------------------ sessions

def start_session(uid: str) -> str:
    token = security.new_token()
    neo4j.write(
        """
        MATCH (u:User {uid: $uid})
        CREATE (:Session {token_hash: $h, created_at: datetime(), expires_at: $exp})-[:OF]->(u)
        """,
        uid=uid, h=security.sha256(token), exp=_now() + timedelta(days=settings().session_days))
    return token


def session_user(token: str) -> str | None:
    """The user of a valid session, extending it (sliding expiry) at most once an hour."""
    rows = neo4j.read(
        "MATCH (s:Session {token_hash: $h})-[:OF]->(u:User) WHERE s.expires_at > datetime() AND NOT u.blocked "
        "RETURN u.uid AS uid, s.expires_at AS exp", h=security.sha256(token))
    if not rows:
        return None
    exp = rows[0]["exp"].to_native()
    fresh = _now() + timedelta(days=settings().session_days)
    if fresh - exp > timedelta(hours=1):
        neo4j.write("MATCH (s:Session {token_hash: $h}) SET s.expires_at = $exp", h=security.sha256(token), exp=fresh)
    return rows[0]["uid"]


def end_session(token: str) -> None:
    neo4j.write("MATCH (s:Session {token_hash: $h}) DETACH DELETE s", h=security.sha256(token))


def end_sessions(uid: str) -> None:
    neo4j.write("MATCH (s:Session)-[:OF]->(:User {uid: $uid}) DETACH DELETE s", uid=uid)
