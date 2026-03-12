import uuid

from sqlalchemy.orm import Session

from app.models.trip import Trip
from app.schemas.trip import TripCreate, TripUpdate


class TripRepository:
    def __init__(self, db: Session):
        self.db = db

    def list(
        self,
        limit: int = 50,
        offset: int = 0,
        destination: str | None = None,
        status: str | None = None,
    ) -> list[Trip]:
        query = self.db.query(Trip)
        if destination:
            query = query.filter(Trip.destination.ilike(f"%{destination}%"))
        if status:
            query = query.filter(Trip.status == status)
        return query.order_by(Trip.start_date.desc()).offset(offset).limit(limit).all()

    def get(self, trip_id: uuid.UUID) -> Trip | None:
        return self.db.query(Trip).filter(Trip.id == trip_id).first()

    def create(self, payload: TripCreate) -> Trip:
        trip = Trip(**payload.model_dump())
        self.db.add(trip)
        self.db.commit()
        self.db.refresh(trip)
        return trip

    def update(self, trip: Trip, payload: TripUpdate) -> Trip:
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(trip, field, value)
        self.db.add(trip)
        self.db.commit()
        self.db.refresh(trip)
        return trip

    def delete(self, trip: Trip) -> None:
        self.db.delete(trip)
        self.db.commit()
