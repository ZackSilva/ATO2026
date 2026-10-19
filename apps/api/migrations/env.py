import os

from alembic import context
from sqlalchemy import create_engine, text

from slabtrak.models import Base

url = os.environ.get("MIGRATION_DATABASE_URL")
if not url:
    raise RuntimeError("Set MIGRATION_DATABASE_URL for explicit migration operations.")

engine = create_engine(url, connect_args={"prepare_threshold": None})
with engine.connect() as connection:
    connection.execute(text("CREATE SCHEMA IF NOT EXISTS slabtrak"))
    connection.commit()
    context.configure(
        connection=connection, target_metadata=Base.metadata, version_table_schema="slabtrak"
    )
    with context.begin_transaction():
        context.run_migrations()
