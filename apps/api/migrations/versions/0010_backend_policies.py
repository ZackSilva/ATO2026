"""Allow the trusted backend role when application tables have RLS enabled."""

from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None

TABLES = (
    "accounts",
    "sessions",
    "login_limits",
    "card_definitions",
    "owned_copies",
    "comparable_sales",
    "market_links",
)


def upgrade():
    # The backend authenticates collectors and scopes queries to their owner.
    # This is a server-only role; anonymous/browser roles receive no policy.
    for table in TABLES:
        op.execute(
            f"CREATE POLICY slabtrak_backend ON slabtrak.{table} "
            "FOR ALL TO slabtrak_app USING (true) WITH CHECK (true)"
        )


def downgrade():
    for table in reversed(TABLES):
        op.execute(f"DROP POLICY slabtrak_backend ON slabtrak.{table}")
