"""Store collector-confirmed card references, without persisting provider sale data."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "market_links",
        sa.Column("copy_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("provider_card_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("provider_parallel_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("provider_grade_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("copy_signature", sa.String(64), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["copy_id"], ["slabtrak.owned_copies.id"], ondelete="CASCADE"),
        schema="slabtrak",
    )
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON slabtrak.market_links TO slabtrak_app")


def downgrade():
    op.drop_table("market_links", schema="slabtrak")
