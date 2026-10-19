"""Create local-only environment settings without printing credentials."""

import os
import secrets
from pathlib import Path

target = Path(__file__).resolve().parents[1] / ".env"
admin = secrets.token_urlsafe(32)
runtime = secrets.token_urlsafe(32)
content = f"""POSTGRES_PASSWORD={admin}
APP_DB_PASSWORD={runtime}
DATABASE_URL=postgresql+psycopg://slabtrak_app:{runtime}@db:5432/slabtrak
MIGRATION_DATABASE_URL=postgresql+psycopg://slabtrak_admin:{admin}@db:5432/slabtrak
APP_ORIGIN=http://localhost:3000
COOKIE_SECURE=false
"""
try:
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
except FileExistsError:
    raise SystemExit(".env already exists; preserved existing settings.") from None
with os.fdopen(fd, "w") as output:
    output.write(content)
print("Created private .env settings. Keep this file out of Git and chat.")
