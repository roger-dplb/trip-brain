import uuid
from datetime import date as DateType
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DayBase(BaseModel):
    trip_id: uuid.UUID
    day_number: int
    date: DateType | None = None
    notes: str | None = None


class DayCreate(DayBase):
    pass


class DayUpdate(BaseModel):
    day_number: int | None = None
    date: DateType | None = None
    notes: str | None = None


class DayRead(DayBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
