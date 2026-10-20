"""Record sales separately from acquisition costs without changing existing cards."""

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "owned_copies",
        sa.Column("sold", sa.Boolean(), nullable=False, server_default=sa.false()),
        schema="slabtrak",
    )
    for name in ("sale_price", "sale_fees"):
        op.add_column("owned_copies", sa.Column(name, sa.Numeric(12, 2)), schema="slabtrak")
        op.create_check_constraint(
            f"ck_owned_copies_{name}",
            "owned_copies",
            f"{name} IS NULL OR {name} >= 0",
            schema="slabtrak",
        )
    op.add_column("owned_copies", sa.Column("sold_on", sa.Date()), schema="slabtrak")
    op.create_check_constraint(
        "ck_owned_copies_sale_state",
        "owned_copies",
        "(sold AND NOT archived AND sale_price IS NOT NULL AND sale_fees IS NOT NULL) "
        "OR (NOT sold AND sale_price IS NULL AND sale_fees IS NULL AND sold_on IS NULL)",
        schema="slabtrak",
    )


def downgrade():
    for name in ("sale_state", "sale_price", "sale_fees"):
        op.drop_constraint(f"ck_owned_copies_{name}", "owned_copies", schema="slabtrak")
    for name in ("sold_on", "sale_fees", "sale_price", "sold"):
        op.drop_column("owned_copies", name, schema="slabtrak")
