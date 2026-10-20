"""Retain optional original-listing image metadata on saved sale evidence."""

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "comparable_sales",
        sa.Column("image_url", sa.String(2048), nullable=True),
        schema="slabtrak",
    )


def downgrade():
    op.drop_column("comparable_sales", "image_url", schema="slabtrak")
