import uuid
from datetime import date as DateType
from datetime import datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Day(Base):
    __tablename__ = "days"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    trip_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False
    )
    day_number: Mapped[int] = mapped_column(Integer, nullable=False)
    date: Mapped[DateType | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    trip = relationship("Trip", back_populates="days")
    activities = relationship(
        "Activity", back_populates="day", cascade="all, delete-orphan"
    )
