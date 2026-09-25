"""Accounts, access codes and the guards on the read API (needs Neo4j)."""

import pytest
from fastapi.testclient import TestClient

from tests.conftest import CSRF, log_in_as

pytestmark = pytest.mark.neo4j


def _collection(name):
    from app.shared import neo4j
    neo4j.write("CREATE (:Collection {uid: $c, name: $c, collection: $c, status: 'ready'})", c=name)


def test_browsing_needs_a_login(client):
    client.cookies.clear()
    assert client.get("/api/collections").status_code == 401
    assert client.get("/api/collections/smoke/corpus").status_code == 401
    assert client.get("/api/auth/me").status_code == 401


def test_codes_decide_role_and_collections(client):
    _collection("smoke_a")
    _collection("smoke_b")
    admin = client.get("/api/auth/me").json()
    assert admin["role"] == "admin" and admin["collections"] == ["*"]

    evaluator = log_in_as(client, "evaluator", ["smoke_a"])
    assert evaluator["role"] == "evaluator" and evaluator["collections"] == ["smoke_a"]
    names = [c["name"] for c in client.get("/api/collections").json()]
    assert "smoke_a" in names and "smoke_b" not in names
    assert client.get("/api/collections/smoke_b/hypotheses").status_code == 404  # doesn't leak
    assert client.get("/api/admin/codes").status_code == 403

    from app.auth import service
    code, _ = service.create_code("smoke b", "evaluator", ["smoke_b"])
    assert client.post("/api/auth/redeem", headers=CSRF, json={"code": code.lower().replace("-", " ")}).json()[
        "collections"] == ["smoke_a", "smoke_b"]


def test_signup_login_logout(client):
    from app.auth import service
    code, record = service.create_code("smoke signup", "evaluator", ["smoke_a"])
    anon = TestClient(client.app)
    body = {"name": "Ada", "email": "Ada@smoke.test", "password": "long enough pw", "code": code}
    assert anon.post("/api/auth/signup", json=body).status_code == 403  # no CSRF header
    assert anon.post("/api/auth/signup", headers=CSRF, json={**body, "code": "GV-NOPE"}).status_code == 403
    assert anon.post("/api/auth/signup", headers=CSRF, json={**body, "password": "short"}).status_code == 422
    assert anon.post("/api/auth/signup", headers=CSRF, json=body).status_code == 200
    assert anon.post("/api/auth/signup", headers=CSRF, json=body).status_code == 409
    assert anon.get("/api/auth/me").json()["email"] == "ada@smoke.test"
    assert anon.post("/api/auth/logout", headers=CSRF).status_code == 200
    anon.cookies.clear()
    assert anon.get("/api/auth/me").status_code == 401
    bad = {"email": "ada@smoke.test", "password": "wrong password"}
    assert anon.post("/api/auth/login", headers=CSRF, json=bad).status_code == 401
    assert anon.post("/api/auth/login", headers=CSRF, json={**bad, "password": "long enough pw"}).status_code == 200

    # a disabled code no longer grants its collections
    client.patch(f"/api/admin/codes/{record['uid']}", headers=CSRF, json={"disabled": True})
    assert anon.get("/api/auth/me").json()["collections"] == []


def test_writes_need_the_csrf_header(client):
    assert client.post("/api/auth/password", json={"current": "x", "new": "yyyyyyyyyy"}).status_code == 403


def test_lockout_and_admin_reset(client):
    anon = TestClient(client.app)
    user = log_in_as(anon, "evaluator", ["smoke_a"])
    anon.cookies.clear()
    bad = {"email": user["email"], "password": "nope nope nope"}
    for _ in range(5):
        assert anon.post("/api/auth/login", headers=CSRF, json=bad).status_code == 401
    good = {**bad, "password": "correct horse battery"}
    assert anon.post("/api/auth/login", headers=CSRF, json=good).status_code == 429

    temporary = client.post(f"/api/admin/users/{user['uid']}/reset-password", headers=CSRF).json()[
        "temporary_password"]
    from app.shared import neo4j
    neo4j.write("MATCH (u:User {uid: $u}) SET u.locked_until = null", u=user["uid"])
    r = anon.post("/api/auth/login", headers=CSRF, json={**bad, "password": temporary})
    assert r.status_code == 200 and r.json()["must_change_password"]
    assert anon.post("/api/auth/password", headers=CSRF, json={"new": "brand new password"}).status_code == 200
    assert anon.get("/api/auth/me").json()["must_change_password"] is False

    client.patch(f"/api/admin/users/{user['uid']}", headers=CSRF, json={"blocked": True})
    assert anon.get("/api/auth/me").status_code == 401


def test_admin_code_listing_never_shows_codes(client):
    created = client.post("/api/admin/codes", headers=CSRF,
                          json={"label": "smoke listed", "role": "evaluator", "collections": ["smoke_a"]}).json()
    assert created["code"].startswith("GV-")
    listed = next(c for c in client.get("/api/admin/codes").json() if c["uid"] == created["uid"])
    assert "code" not in listed and "code_hash" not in listed and listed["code_hint"]
