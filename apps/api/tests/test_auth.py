from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import select, text
from sqlalchemy.exc import ProgrammingError

from slabtrak.app import COOKIE, create_app
from slabtrak.cli import set_credentials
from slabtrak.config import Settings
from slabtrak.models import Account, LoginSession
from slabtrak.security import digest
from tests.conftest import ORIGIN, PASSWORD


def login(client, username="collector", password=PASSWORD):
    return client.post("/api/auth/login", json={"username": username, "password": password})


def test_private_session_survives_api_restart_and_is_hashed(client, app):
    assert client.get("/api/auth/me").status_code == 401
    result = login(client)
    assert result.status_code == 200
    token = client.cookies[COOKIE]
    assert "HttpOnly" in result.headers["set-cookie"]
    assert "SameSite=lax" in result.headers["set-cookie"]
    assert result.headers["cache-control"] == "no-store"
    with app.state.sessions() as db:
        assert db.get(LoginSession, token) is None
        assert db.get(LoginSession, digest(token)) is not None
        assert db.scalar(select(Account)).password_hash.startswith("$argon2id$")
    restarted = create_app(
        Settings(
            database_url=app.state.engine.url.render_as_string(hide_password=False),
            app_origin=ORIGIN,
        )
    )
    with TestClient(restarted, base_url=ORIGIN) as second:
        second.cookies.set(COOKIE, token)
        assert second.get("/api/auth/me").json()["username"] == "collector"


def test_logout_requires_csrf_and_revokes_server_session(client, app):
    identity = login(client).json()
    token = client.cookies[COOKIE]
    assert client.post("/api/auth/logout").status_code == 403
    assert client.get("/api/auth/me").status_code == 200
    result = client.post("/api/auth/logout", headers={"X-CSRF-Token": identity["csrf_token"]})
    assert result.status_code == 204
    assert client.get("/api/auth/me").status_code == 401
    client.cookies.set(COOKIE, token)
    assert client.get("/api/auth/me").status_code == 401


def test_cross_site_and_missing_origin_are_rejected(client):
    assert (
        client.post(
            "/api/auth/login",
            headers={"Origin": "https://untrusted.example"},
            json={"username": "collector", "password": PASSWORD},
        ).status_code
        == 403
    )
    client.headers.pop("origin")
    assert login(client).status_code == 403


def test_expired_session_cannot_be_used(client, app):
    login(client)
    with app.state.sessions() as db:
        stored = db.get(LoginSession, digest(client.cookies[COOKIE]))
        stored.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        db.commit()
    assert client.get("/api/auth/me").status_code == 401


def test_invalid_credentials_are_generic_and_throttled_across_processes(client, app):
    missing = login(client, "no-such-user", "wrong").json()
    assert missing == login(client, password="wrong").json()
    for _ in range(4):
        assert login(client, password="wrong").status_code == 401
    # A fresh application instance shares the same failed-attempt counter.
    restarted = create_app(
        Settings(
            database_url=app.state.engine.url.render_as_string(hide_password=False),
            app_origin=ORIGIN,
        )
    )
    with TestClient(restarted, base_url=ORIGIN, headers={"Origin": ORIGIN}) as second:
        result = login(second)
        assert result.status_code == 429
        assert int(result.headers["retry-after"]) > 0


def test_concurrent_failed_attempts_obey_shared_limit(app):
    def attempt(_):
        with TestClient(app, base_url=ORIGIN, headers={"Origin": ORIGIN}) as other:
            return login(other, password="wrong").status_code

    with ThreadPoolExecutor(max_workers=3) as pool:
        statuses = list(pool.map(attempt, range(7)))
    assert statuses.count(401) == 5
    assert statuses.count(429) == 2


def test_username_case_cannot_bypass_throttle(client):
    for username in ("collector", "COLLECTOR", " Collector ", "Collector", "collector"):
        assert login(client, username, "wrong").status_code == 401
    assert login(client).status_code == 429


def test_recovery_revokes_sessions_and_changes_password(client, app):
    login(client)
    with app.state.sessions() as db:
        set_credentials(db, "reset-password", "collector", PASSWORD + "-new")
    assert client.get("/api/auth/me").status_code == 401
    assert login(client).status_code == 401
    assert login(client, password=PASSWORD + "-new").status_code == 200


def test_no_public_signup_and_owner_cannot_be_recreated(client, app):
    assert client.post("/api/auth/register", json={}).status_code == 404
    with app.state.sessions() as db:
        with pytest.raises(ValueError, match="already exists"):
            set_credentials(db, "create-owner", "new-owner", PASSWORD)


def test_owner_bootstrap_normalizes_and_rejects_weak_passwords(client, app, migrated_database):
    with migrated_database.begin() as connection:
        connection.execute(text("TRUNCATE slabtrak.accounts CASCADE"))
    with app.state.sessions() as db:
        with pytest.raises(ValueError, match="12 and 128"):
            set_credentials(db, "create-owner", "New.Owner", "short")
        set_credentials(db, "create-owner", "New.Owner", PASSWORD)
    assert login(client, "NEW.OWNER").status_code == 200


def test_credentials_not_reflected_in_errors_and_oversized_body_rejected(client):
    secret = "private-password-value"
    result = client.post("/api/auth/login", json={"username": "!invalid", "password": secret})
    assert result.status_code == 422
    assert secret not in result.text
    assert "!invalid" not in result.text
    assert client.post("/api/auth/login", content=b"x" * 4097).status_code == 413


def test_logging_in_rotates_existing_session(client):
    login(client)
    previous = client.cookies[COOKIE]
    login(client)
    assert client.cookies[COOKIE] != previous
    client.cookies.set(COOKIE, previous)
    assert client.get("/api/auth/me").status_code == 401


def test_runtime_role_cannot_modify_schema(app):
    with app.state.sessions() as db:
        with pytest.raises(ProgrammingError):
            db.execute(text("CREATE TABLE slabtrak.forbidden (id int)"))


def test_other_account_has_distinct_session_identity(client, app):
    from slabtrak.security import password_hasher

    with app.state.sessions() as db:
        db.add(
            Account(
                username="another-collector",
                password_hash=password_hasher.hash(PASSWORD),
                created_at=datetime.now(UTC),
            )
        )
        db.commit()
    login(client)
    with TestClient(app, base_url=ORIGIN, headers={"Origin": ORIGIN}) as other:
        assert login(other, "another-collector").status_code == 200
        assert other.get("/api/auth/me").json()["username"] == "another-collector"
    assert client.get("/api/auth/me").json()["username"] == "collector"


def test_remote_deployment_requires_secure_settings():
    with pytest.raises(ValidationError, match="HTTPS"):
        Settings(database_url="postgresql+psycopg://unused", app_origin="https://slabtrak.example")
