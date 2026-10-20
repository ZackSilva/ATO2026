"""Private recorded completed-sale evidence; existing card records are unchanged."""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "comparable_sales",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("definition_id", sa.Uuid(), nullable=False),
        sa.Column("source_key", sa.String(64), nullable=False),
        sa.Column("sold_on", sa.Date(), nullable=False),
        sa.Column("price", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("condition", sa.String(10), nullable=False),
        sa.Column("grader", sa.String(50), nullable=False),
        sa.Column("grade", sa.String(20), nullable=False),
        sa.Column("source", sa.String(120), nullable=False),
        sa.Column("source_url", sa.String(2048), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["slabtrak.accounts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["definition_id", "owner_id"],
            ["slabtrak.card_definitions.id", "slabtrak.card_definitions.owner_id"],
        ),
        sa.UniqueConstraint("owner_id", "source_key"),
        sa.CheckConstraint("price > 0"),
        sa.CheckConstraint("condition IN ('raw', 'graded')"),
        sa.CheckConstraint(
            "(condition = 'raw' AND grader = '' AND grade = '') OR "
            "(condition = 'graded' AND grader <> '' AND grade <> '')"
        ),
        schema="slabtrak",
    )
    op.create_index(
        "ix_comparable_sales_owner_id", "comparable_sales", ["owner_id"], schema="slabtrak"
    )
    op.execute("GRANT SELECT, INSERT, DELETE ON slabtrak.comparable_sales TO slabtrak_app")


def downgrade():
    op.drop_table("comparable_sales", schema="slabtrak")
