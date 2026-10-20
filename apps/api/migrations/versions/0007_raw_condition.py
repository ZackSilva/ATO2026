"""Add explicit raw condition categories without reclassifying saved cards or sales."""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

TABLES = ("owned_copies", "comparable_sales")


def upgrade():
    for table in TABLES:
        op.add_column(
            table,
            sa.Column("raw_condition", sa.String(12), nullable=False, server_default="unspecified"),
            schema="slabtrak",
        )
        op.create_check_constraint(
            f"ck_{table}_raw_condition",
            table,
            "raw_condition IN ('unspecified', 'near_mint', 'excellent', 'good', 'fair', 'poor') "
            "AND (condition = 'raw' OR raw_condition = 'unspecified')",
            schema="slabtrak",
        )


def downgrade():
    for table in reversed(TABLES):
        op.drop_constraint(f"ck_{table}_raw_condition", table, type_="check", schema="slabtrak")
        op.drop_column(table, "raw_condition", schema="slabtrak")
