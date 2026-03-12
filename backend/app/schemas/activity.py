import uuid
from datetime import datetime, time

from pydantic import BaseModel, ConfigDict


class ActivityBase(BaseModel):
    day_id: uuid.UUID
    title: str
    location: str | None = None
    scheduled_time: time | None = None
    notes: str | None = None
    status: str = "planned"


class ActivityCreate(ActivityBase):
    pass


class ActivityUpdate(BaseModel):
    title: str | None = None
    location: str | None = None
    scheduled_time: time | None = None
    notes: str | None = None
    status: str | None = None


class ActivityRead(ActivityBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
