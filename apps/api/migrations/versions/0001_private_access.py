"""Owner accounts, revocable sessions, and shared login throttling."""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "accounts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("username", sa.String(64), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        schema="slabtrak",
    )
    op.create_table(
        "sessions",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column(
            "account_id",
            sa.Uuid(),
            sa.ForeignKey("slabtrak.accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        schema="slabtrak",
    )
    op.create_index("ix_sessions_account_id", "sessions", ["account_id"], schema="slabtrak")
    op.create_index("ix_sessions_expires_at", "sessions", ["expires_at"], schema="slabtrak")
    op.create_table(
        "login_limits",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("failures", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("failures >= 0"),
        schema="slabtrak",
    )
    op.create_index("ix_login_limits_started_at", "login_limits", ["started_at"], schema="slabtrak")
    # No browser-facing Data API access. Local runtime role has DML, not schema ownership.
    op.execute("REVOKE ALL ON SCHEMA slabtrak FROM PUBLIC")
    op.execute("GRANT USAGE ON SCHEMA slabtrak TO slabtrak_app")
    for table in ("accounts", "sessions", "login_limits"):
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON slabtrak.{table} TO slabtrak_app")


def downgrade():
    for table in ("login_limits", "sessions", "accounts"):
        op.drop_table(table, schema="slabtrak")
