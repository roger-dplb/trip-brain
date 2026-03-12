import uuid

from fastapi import HTTPException, status

from app.models.day import Day
from app.repositories.day_repository import DayRepository
from app.schemas.day import DayCreate, DayUpdate


class DayService:
    def __init__(self, repository: DayRepository):
        self.repository = repository

    def list(
        self,
        trip_id: uuid.UUID | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Day]:
        return self.repository.list(trip_id, limit, offset)

    def get_or_none(self, day_id: uuid.UUID) -> Day | None:
        return self.repository.get(day_id)

    def create(self, payload: DayCreate) -> Day:
        existing = self.repository.find_by_trip_and_day_number(
            trip_id=payload.trip_id,
            day_number=payload.day_number,
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Day number already exists for this trip",
            )
        return self.repository.create(payload)

    def update(self, day: Day, payload: DayUpdate) -> Day:
        if payload.day_number is not None and payload.day_number != day.day_number:
            existing = self.repository.find_by_trip_and_day_number(
                trip_id=day.trip_id,
                day_number=payload.day_number,
            )
            if existing and existing.id != day.id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Day number already exists for this trip",
                )
        return self.repository.update(day, payload)

    def delete(self, day: Day) -> None:
        self.repository.delete(day)
