"""Separate card identities from privately owned physical copies."""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "card_definitions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "owner_id",
            sa.Uuid(),
            sa.ForeignKey("slabtrak.accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("subject", sa.String(200), nullable=False),
        sa.Column("year", sa.Integer()),
        sa.Column("sport", sa.String(100), nullable=False),
        sa.Column("manufacturer", sa.String(100), nullable=False),
        sa.Column("set_name", sa.String(150), nullable=False),
        sa.Column("card_number", sa.String(50), nullable=False),
        sa.Column("parallel", sa.String(150), nullable=False),
        sa.Column("autograph", sa.Boolean(), nullable=False),
        sa.Column("memorabilia", sa.Boolean(), nullable=False),
        sa.Column("print_run", sa.Integer()),
        sa.UniqueConstraint("id", "owner_id"),
        sa.UniqueConstraint("owner_id", "fingerprint"),
        sa.CheckConstraint("year IS NULL OR year BETWEEN 1800 AND 2200"),
        sa.CheckConstraint("print_run IS NULL OR print_run > 0"),
        schema="slabtrak",
    )
    op.create_table(
        "owned_copies",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "owner_id",
            sa.Uuid(),
            sa.ForeignKey("slabtrak.accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("definition_id", sa.Uuid(), nullable=False),
        sa.Column("condition", sa.String(10), nullable=False),
        sa.Column("grader", sa.String(50), nullable=False),
        sa.Column("grade", sa.String(20), nullable=False),
        sa.Column("certification", sa.String(100), nullable=False),
        *(
            sa.Column(field, sa.Numeric(3, 1))
            for field in (
                "centering",
                "corners",
                "edges",
                "surface",
            )
        ),
        sa.Column("serial_number", sa.Integer()),
        *(
            sa.Column(field, sa.Numeric(12, 2))
            for field in (
                "purchase_price",
                "shipping",
                "tax",
                "other_cost",
            )
        ),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("acquired_on", sa.Date()),
        sa.Column("seller", sa.String(200), nullable=False),
        sa.Column("notes", sa.String(2000), nullable=False),
        sa.Column("archived", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["definition_id", "owner_id"],
            ["slabtrak.card_definitions.id", "slabtrak.card_definitions.owner_id"],
        ),
        sa.CheckConstraint("condition IN ('raw', 'graded')"),
        sa.CheckConstraint("revision > 0"),
        sa.CheckConstraint("serial_number IS NULL OR serial_number > 0"),
        *(
            sa.CheckConstraint(f"{field} IS NULL OR {field} >= 0")
            for field in (
                "purchase_price",
                "shipping",
                "tax",
                "other_cost",
            )
        ),
        schema="slabtrak",
    )
    op.create_index("ix_owned_copies_owner_id", "owned_copies", ["owner_id"], schema="slabtrak")
    for table in ("card_definitions", "owned_copies"):
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON slabtrak.{table} TO slabtrak_app")


def downgrade():
    op.drop_table("owned_copies", schema="slabtrak")
    op.drop_table("card_definitions", schema="slabtrak")
