import uuid

from fastapi import HTTPException, status

from app.models.trip import Trip
from app.repositories.trip_repository import TripRepository
from app.schemas.trip import TripCreate, TripUpdate


class TripService:
    def __init__(self, repository: TripRepository):
        self.repository = repository

    def list(
        self,
        limit: int = 50,
        offset: int = 0,
        destination: str | None = None,
        status_filter: str | None = None,
    ) -> list[Trip]:
        return self.repository.list(limit, offset, destination, status_filter)

    def get_or_none(self, trip_id: uuid.UUID) -> Trip | None:
        return self.repository.get(trip_id)

    def create(self, payload: TripCreate) -> Trip:
        self._validate_dates(payload.start_date, payload.end_date)
        return self.repository.create(payload)

    def update(self, trip: Trip, payload: TripUpdate) -> Trip:
        start_date = (
            payload.start_date if payload.start_date is not None else trip.start_date
        )
        end_date = payload.end_date if payload.end_date is not None else trip.end_date
        self._validate_dates(start_date, end_date)
        return self.repository.update(trip, payload)

    def delete(self, trip: Trip) -> None:
        self.repository.delete(trip)

    def _validate_dates(self, start_date, end_date) -> None:
        if start_date > end_date:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="start_date must be before or equal to end_date",
            )
