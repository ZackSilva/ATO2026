"""Store a collector's research query separately from confirmed market matches."""

import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "owned_copies",
        sa.Column("market_query", sa.String(200), nullable=False, server_default=""),
        schema="slabtrak",
    )


def downgrade():
    op.drop_column("owned_copies", "market_query", schema="slabtrak")
