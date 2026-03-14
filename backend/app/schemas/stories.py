import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class StoryExportJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    trip_id: uuid.UUID
    status: str
    zip_object_key: str | None = None
    mp4_object_key: str | None = None
    error_msg: str | None = None
    created_at: datetime


class StoryExportTriggerResponse(BaseModel):
    job_id: uuid.UUID
    status: str
    cached: bool
    zip_url: str | None = None
    mp4_url: str | None = None


class StoryExportStatusResponse(BaseModel):
    job_id: uuid.UUID
    status: str
    zip_url: str | None = None
    mp4_url: str | None = None
    error_msg: str | None = None
