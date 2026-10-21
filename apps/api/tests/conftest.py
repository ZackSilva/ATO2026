import os
from datetime import UTC, datetime
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from slabtrak.app import create_app
from slabtrak.config import Settings
from slabtrak.models import Account, Base
from slabtrak.security import password_hasher

PASSWORD = "Only-for-isolated-tests-123!"
ORIGIN = "http://localhost:3000"


@pytest.fixture(scope="session", autouse=True)
def migrated_database():
    runtime_url = os.environ.get("TEST_DATABASE_URL", "")
    migration_url = os.environ.get("TEST_MIGRATION_DATABASE_URL", "")
    if not runtime_url or not migration_url:
        pytest.fail(
            "Set TEST_DATABASE_URL and TEST_MIGRATION_DATABASE_URL "
            "to an isolated PostgreSQL test database."
        )
    for url in (runtime_url, migration_url):
        if not (make_url(url).database or "").endswith("_test"):
            pytest.fail("Integration tests only run against database names ending in _test.")
    os.environ["MIGRATION_DATABASE_URL"] = migration_url
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.upgrade(config, "head")
    engine = create_engine(migration_url)
    # Exercise the hosted configuration: policies must work under real RLS.
    with engine.begin() as connection:
        for table in Base.metadata.sorted_tables:
            connection.execute(text(f"ALTER TABLE slabtrak.{table.name} ENABLE ROW LEVEL SECURITY"))
    yield engine
    engine.dispose()


@pytest.fixture
def app(migrated_database, tmp_path):
    with migrated_database.begin() as connection:
        connection.execute(
            text("TRUNCATE slabtrak.sessions, slabtrak.login_limits, slabtrak.accounts CASCADE")
        )
    application = create_app(
        Settings(
            database_url=os.environ["TEST_DATABASE_URL"],
            app_origin=ORIGIN,
            photo_root=tmp_path / "photos",
        )
    )
    with application.state.sessions() as db:
        db.add(
            Account(
                username="collector",
                password_hash=password_hasher.hash(PASSWORD),
                created_at=datetime.now(UTC),
            )
        )
        db.commit()
    yield application
    application.state.engine.dispose()


@pytest.fixture
def client(app):
    with TestClient(app, base_url=ORIGIN, headers={"Origin": ORIGIN}) as test_client:
        yield test_client
