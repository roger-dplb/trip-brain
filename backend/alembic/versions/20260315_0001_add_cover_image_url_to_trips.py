"""add cover_image_url to trips

Revision ID: 20260315_0001
Revises: 20260314_0004
Create Date: 2026-03-15
"""

import sqlalchemy as sa
from alembic import op

revision = "20260315_0001"
down_revision = "20260314_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "trips",
        sa.Column("cover_image_url", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("trips", "cover_image_url")
