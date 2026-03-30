import uuid
from datetime import date as DateType
from datetime import datetime, time

from pydantic import BaseModel

from app.schemas.location import LocationResponse


class TimelineActivity(BaseModel):
    id: uuid.UUID
    title: str
    location: str | None
    scheduled_time: time | None
    status: str
    location_detail: LocationResponse | None = None


class TimelineMemory(BaseModel):
    id: uuid.UUID
    activity_id: uuid.UUID | None = None
    memory_type: str
    caption: str | None
    storage_key: str | None
    public_url: str | None = None
    created_at: datetime


class TimelineDay(BaseModel):
    id: uuid.UUID
    day_number: int
    date: DateType | None
    activities: list[TimelineActivity]
    memories: list[TimelineMemory]
    location: LocationResponse | None = None


class TripTimelineRead(BaseModel):
    trip_id: uuid.UUID
    trip_name: str
    days: list[TimelineDay]
