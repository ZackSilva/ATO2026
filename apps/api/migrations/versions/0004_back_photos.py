"""Separate back photos while preserving existing front previews."""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("owned_copies", sa.Column("back_photo_key", sa.Uuid()), schema="slabtrak")
    op.add_column(
        "owned_copies",
        sa.Column("back_photo_kind", sa.String(10), nullable=False, server_default="upload"),
        schema="slabtrak",
    )
    op.add_column(
        "owned_copies",
        sa.Column("back_photo_source", sa.String(2048), nullable=False, server_default=""),
        schema="slabtrak",
    )
    op.create_check_constraint(
        "ck_owned_copies_back_photo_kind",
        "owned_copies",
        "back_photo_kind IN ('upload', 'reference')",
        schema="slabtrak",
    )


def downgrade():
    op.drop_constraint("ck_owned_copies_back_photo_kind", "owned_copies", schema="slabtrak")
    for name in ("back_photo_source", "back_photo_kind", "back_photo_key"):
        op.drop_column("owned_copies", name, schema="slabtrak")
