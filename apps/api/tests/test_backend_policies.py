import pytest
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError

from tests.conftest import PASSWORD


def test_missing_login_policy_reproduces_storage_error(client, migrated_database):
    assert client.get("/api/health").status_code == 200
    with migrated_database.begin() as connection:
        connection.execute(text("DROP POLICY slabtrak_backend ON slabtrak.login_limits"))
    try:
        result = client.post(
            "/api/auth/login", json={"username": "collector", "password": "incorrect"}
        )
        assert result.status_code == 503
        assert result.json()["detail"] == "Storage is temporarily unavailable. Please retry."
    finally:
        with migrated_database.begin() as connection:
            connection.execute(text(
                "CREATE POLICY slabtrak_backend ON slabtrak.login_limits "
                "FOR ALL TO slabtrak_app USING (true) WITH CHECK (true)"
            ))
    # Wrong passwords exercise the throttle INSERT blocked in the hosted failure.
    assert client.post(
        "/api/auth/login", json={"username": "collector", "password": "incorrect"}
    ).status_code == 401
    assert client.post(
        "/api/auth/login", json={"username": "collector", "password": PASSWORD}
    ).status_code == 200
    assert client.get("/api/auth/me").status_code == 200


def test_backend_policy_does_not_grant_access_to_other_roles(app, migrated_database):
    # Transaction-local role/grants prove RLS, rather than a missing table grant,
    # prevents another role from reading or writing account records.
    with migrated_database.connect() as connection:
        transaction = connection.begin()
        try:
            connection.execute(text("CREATE ROLE slabtrak_rls_probe NOLOGIN"))
            connection.execute(text("GRANT USAGE ON SCHEMA slabtrak TO slabtrak_rls_probe"))
            connection.execute(text(
                "GRANT SELECT, INSERT ON slabtrak.accounts TO slabtrak_rls_probe"
            ))
            connection.execute(text("SET LOCAL ROLE slabtrak_rls_probe"))
            assert connection.scalar(text("SELECT count(*) FROM slabtrak.accounts")) == 0
            with pytest.raises(ProgrammingError) as failure:
                connection.execute(text(
                    "INSERT INTO slabtrak.accounts (id, username, password_hash, created_at) "
                    "VALUES (gen_random_uuid(), 'rls-probe', 'not-a-password-hash', now())"
                ))
            assert failure.value.orig.sqlstate == "42501"
        finally:
            transaction.rollback()


def test_runtime_role_remains_restricted_and_cannot_change_policies(app):
    with app.state.sessions() as db:
        assert db.execute(text(
            "SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls "
            "FROM pg_roles WHERE rolname=current_user"
        )).one() == (False, False, False, False)
        with pytest.raises(ProgrammingError):
            db.execute(text("ALTER TABLE slabtrak.accounts DISABLE ROW LEVEL SECURITY"))
