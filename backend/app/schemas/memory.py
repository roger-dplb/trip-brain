import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MemoryBase(BaseModel):
    trip_id: uuid.UUID
    day_id: uuid.UUID | None = None
    activity_id: uuid.UUID | None = None
    memory_type: str
    storage_key: str | None = None
    content_text: str | None = None
    caption: str | None = None
    taken_at: datetime | None = None


class MemoryCreate(MemoryBase):
    pass


class MemoryUpdate(BaseModel):
    day_id: uuid.UUID | None = None
    activity_id: uuid.UUID | None = None
    memory_type: str | None = None
    storage_key: str | None = None
    content_text: str | None = None
    caption: str | None = None
    taken_at: datetime | None = None


class MemoryRead(MemoryBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    public_url: str | None = None
    created_at: datetime
