"""Run integration checks against a dedicated local _test database, never the collection DB."""

import os
import subprocess
from pathlib import Path

from dotenv import dotenv_values
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

root = Path(__file__).resolve().parents[1]
values = dotenv_values(root / ".env")


def local_url(key, database="slabtrak_test"):
    return make_url(values[key]).set(host="127.0.0.1", port=55432, database=database)


admin_url = local_url("MIGRATION_DATABASE_URL", "slabtrak")
admin = create_engine(admin_url, isolation_level="AUTOCOMMIT")
with admin.connect() as connection:
    if not connection.scalar(text("SELECT 1 FROM pg_database WHERE datname='slabtrak_test'")):
        connection.execute(text("CREATE DATABASE slabtrak_test"))
admin.dispose()
environment = dict(os.environ)
environment["TEST_DATABASE_URL"] = local_url("DATABASE_URL").render_as_string(hide_password=False)
environment["TEST_MIGRATION_DATABASE_URL"] = local_url("MIGRATION_DATABASE_URL").render_as_string(
    hide_password=False
)
raise SystemExit(
    subprocess.call(
        [str(root / "apps/api/.venv/bin/python"), "-m", "pytest", "-q"],
        cwd=root / "apps/api",
        env=environment,
    )
)
