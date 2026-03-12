import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class TripBase(BaseModel):
    name: str
    destination: str
    start_date: date
    end_date: date
    summary: str | None = None
    status: str = "planning"


class TripCreate(TripBase):
    pass


class TripUpdate(BaseModel):
    name: str | None = None
    destination: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    summary: str | None = None
    status: str | None = None


class TripRead(TripBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
