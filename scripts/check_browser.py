"""Exercise the frontend and backend using an isolated test account/database."""

import os
import secrets
import shutil
import socket
import subprocess
import time
import urllib.request
from contextlib import ExitStack
from datetime import UTC, datetime
from pathlib import Path
from tempfile import TemporaryDirectory, gettempdir

from dotenv import dotenv_values
from PIL import Image, ImageDraw
from sqlalchemy import create_engine, delete, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from slabtrak.models import Account, CardDefinition, LoginLimit, OwnedCopy
from slabtrak.security import password_hasher

# Run this helper with PYTHONPATH=apps/api and the API virtual environment.
root = Path(__file__).resolve().parents[1]

values = dotenv_values(root / ".env")
if os.environ.get("TEST_DATABASE_URL") and os.environ.get("TEST_MIGRATION_DATABASE_URL"):
    values = {
        "DATABASE_URL": os.environ["TEST_DATABASE_URL"],
        "MIGRATION_DATABASE_URL": os.environ["TEST_MIGRATION_DATABASE_URL"],
    }
url = make_url(values["DATABASE_URL"]).set(host="127.0.0.1", port=55432, database="slabtrak_test")
engine = create_engine(url)
username = "browser-check"
password = secrets.token_urlsafe(24)
with Session(engine) as db:
    account = db.scalar(select(Account).where(Account.username == username))
    if not account:
        account = Account(username=username, created_at=datetime.now(UTC))
        db.add(account)
    account.password_hash = password_hasher.hash(password)
    db.flush()
    db.execute(delete(OwnedCopy).where(OwnedCopy.owner_id == account.id))
    db.execute(delete(CardDefinition).where(CardDefinition.owner_id == account.id))
    db.execute(delete(LoginLimit))
    db.commit()
engine.dispose()

node = shutil.which("node")
if not node:
    raise SystemExit("Node.js 24 must be on PATH.")
for port in (3000, 8000):
    with socket.socket() as probe:
        # Closed connections can remain in TIME_WAIT after Docker releases a port.
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            probe.bind(("127.0.0.1", port))
        except OSError:
            raise SystemExit(
                f"Port {port} is in use; stop the local stack before browser checks."
            ) from None
env = dict(os.environ)
env.update(
    DATABASE_URL=url.render_as_string(hide_password=False),
    APP_ORIGIN="http://localhost:3000",
    COOKIE_SECURE="false",
    NEXT_TELEMETRY_DISABLED="1",
    SLABTRAK_TEST_USERNAME=username,
    SLABTRAK_TEST_PASSWORD=password,
    HOSTNAME="127.0.0.1",
    PORT="3000",
)
processes = []
resources = ExitStack()
artifacts = Path(resources.enter_context(TemporaryDirectory(prefix="slabtrak-browser-photos-")))
env["PHOTO_ROOT"] = str(artifacts / "private-photos")
fixture = Image.new("RGB", (180, 250), "#284d3c")
ImageDraw.Draw(fixture).text((36, 110), "TEST ONLY", fill="white")
fixture.save(artifacts / "test-card.png")
env["SLABTRAK_TEST_PHOTO"] = str(artifacts / "test-card.png")
try:
    for name, cwd, command in [
        (
            "api",
            root / "apps/api",
            [
                str(root / "apps/api/.venv/bin/uvicorn"),
                "main:app",
                "--host",
                "127.0.0.1",
                "--port",
                "8000",
                "--no-access-log",
            ],
        ),
        (
            "web",
            root / "apps/web",
            [
                node,
                ".next/standalone/server.js",
            ],
        ),
    ]:
        log_path = Path(gettempdir()) / f"slabtrak-browser-{name}.log"
        log = resources.enter_context(open(log_path, "w"))
        processes.append(subprocess.Popen(command, cwd=cwd, env=env, stdout=log, stderr=log))
    for address in ("http://127.0.0.1:8000/api/health", "http://localhost:3000"):
        for _ in range(60):
            if any(process.poll() is not None for process in processes):
                raise SystemExit("A test server stopped. Inspect the temporary browser-test logs.")
            try:
                urllib.request.urlopen(address, timeout=1).close()
                break
            except OSError:
                time.sleep(0.5)
        else:
            raise SystemExit("Test server readiness timed out.")
    result = subprocess.call(
        [node, "node_modules/@playwright/test/cli.js", "test"],
        cwd=root / "apps/web",
        env=env,
    )
finally:
    for process in processes:
        process.terminate()
    for process in processes:
        process.wait(timeout=15)
    resources.close()
raise SystemExit(result)
