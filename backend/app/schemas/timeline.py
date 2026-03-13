import uuid
from datetime import date as DateType
from datetime import datetime, time

from pydantic import BaseModel


class TimelineActivity(BaseModel):
    id: uuid.UUID
    title: str
    location: str | None
    scheduled_time: time | None
    status: str


class TimelineMemory(BaseModel):
    id: uuid.UUID
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


class TripTimelineRead(BaseModel):
    trip_id: uuid.UUID
    days: list[TimelineDay]
