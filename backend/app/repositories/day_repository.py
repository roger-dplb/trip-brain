import uuid

from sqlalchemy.orm import Session

from app.models.day import Day
from app.schemas.day import DayCreate, DayUpdate


class DayRepository:
    def __init__(self, db: Session):
        self.db = db

    def list(
        self,
        trip_id: uuid.UUID | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Day]:
        query = self.db.query(Day)
        if trip_id:
            query = query.filter(Day.trip_id == trip_id)
        return query.order_by(Day.day_number.asc()).offset(offset).limit(limit).all()

    def find_by_trip_and_day_number(
        self,
        trip_id: uuid.UUID,
        day_number: int,
    ) -> Day | None:
        return (
            self.db.query(Day)
            .filter(Day.trip_id == trip_id, Day.day_number == day_number)
            .first()
        )

    def get(self, day_id: uuid.UUID) -> Day | None:
        return self.db.query(Day).filter(Day.id == day_id).first()

    def create(self, payload: DayCreate) -> Day:
        day = Day(**payload.model_dump())
        self.db.add(day)
        self.db.commit()
        self.db.refresh(day)
        return day

    def update(self, day: Day, payload: DayUpdate) -> Day:
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(day, field, value)
        self.db.add(day)
        self.db.commit()
        self.db.refresh(day)
        return day

    def delete(self, day: Day) -> None:
        self.db.delete(day)
        self.db.commit()
