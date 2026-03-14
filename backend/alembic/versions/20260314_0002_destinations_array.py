# backend/alembic/versions/20260314_0002_destinations_array.py
"""migrate destination to destinations array

Revision ID: 20260314_0002
Revises: 20260312_0001
Create Date: 2026-03-14
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260314_0002"
down_revision = "20260312_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Step 1: add nullable column
    op.add_column(
        "trips",
        sa.Column(
            "destinations",
            postgresql.ARRAY(sa.String(120)),
            nullable=True,
        ),
    )
    # Step 2: copy existing data (each row gets a single-item array)
    op.execute("UPDATE trips SET destinations = ARRAY[destination]")
    # Step 3: set NOT NULL and default
    op.alter_column("trips", "destinations", nullable=False,
                    server_default=sa.text("'{}'"))
    # Step 4: drop old column
    op.drop_column("trips", "destination")


def downgrade() -> None:
    # Step 1: add back old column (nullable to allow filling)
    op.add_column(
        "trips",
        sa.Column("destination", sa.String(120), nullable=True),
    )
    # Step 2: copy first element back
    op.execute("UPDATE trips SET destination = destinations[1]")
    # Step 3: set NOT NULL
    op.alter_column("trips", "destination", nullable=False)
    # Step 4: drop array column
    op.drop_column("trips", "destinations")
