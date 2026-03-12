"""initial schema

Revision ID: 20260312_0001
Revises:
Create Date: 2026-03-12 00:00:00
"""

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

revision = "20260312_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "trips",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False
        ),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("destination", sa.String(length=120), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column(
            "status", sa.String(length=30), nullable=False, server_default="planning"
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_table(
        "days",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False
        ),
        sa.Column(
            "trip_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("trips.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("day_number", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_table(
        "activities",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False
        ),
        sa.Column(
            "day_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("days.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("location", sa.Text(), nullable=True),
        sa.Column("scheduled_time", sa.Time(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), nullable=False, server_default="planned"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_table(
        "memories",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False
        ),
        sa.Column(
            "trip_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("trips.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "day_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("days.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "activity_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("activities.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("memory_type", sa.Text(), nullable=False),
        sa.Column("storage_key", sa.Text(), nullable=True),
        sa.Column("content_text", sa.Text(), nullable=True),
        sa.Column("caption", sa.Text(), nullable=True),
        sa.Column("taken_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_table(
        "embeddings",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False
        ),
        sa.Column("source_type", sa.Text(), nullable=False),
        sa.Column("source_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(dim=1536), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_index("ix_days_trip_id", "days", ["trip_id"])
    op.create_index("ix_activities_day_id", "activities", ["day_id"])
    op.create_index("ix_memories_trip_id", "memories", ["trip_id"])
    op.create_index("ix_embeddings_source", "embeddings", ["source_type", "source_id"])
    op.execute(
        "CREATE INDEX IF NOT EXISTS embeddings_embedding_idx ON embeddings USING ivfflat (embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS embeddings_embedding_idx")
    op.drop_index("ix_embeddings_source", table_name="embeddings")
    op.drop_index("ix_memories_trip_id", table_name="memories")
    op.drop_index("ix_activities_day_id", table_name="activities")
    op.drop_index("ix_days_trip_id", table_name="days")
    op.drop_table("embeddings")
    op.drop_table("memories")
    op.drop_table("activities")
    op.drop_table("days")
    op.drop_table("trips")
