"""Private preview files for individual owned cards."""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("owned_copies", sa.Column("photo_key", sa.Uuid()), schema="slabtrak")
    op.add_column(
        "owned_copies",
        sa.Column(
            "photo_kind",
            sa.String(10),
            nullable=False,
            server_default="upload",
        ),
        schema="slabtrak",
    )
    op.add_column(
        "owned_copies",
        sa.Column(
            "photo_source",
            sa.String(2048),
            nullable=False,
            server_default="",
        ),
        schema="slabtrak",
    )
    op.create_check_constraint(
        "ck_owned_copies_photo_kind",
        "owned_copies",
        "photo_kind IN ('upload', 'reference')",
        schema="slabtrak",
    )


def downgrade():
    op.drop_constraint("ck_owned_copies_photo_kind", "owned_copies", schema="slabtrak")
    for name in ("photo_source", "photo_kind", "photo_key"):
        op.drop_column("owned_copies", name, schema="slabtrak")
