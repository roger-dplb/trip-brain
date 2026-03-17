import uuid
from datetime import datetime

from pydantic import BaseModel


class UploadPresignRequest(BaseModel):
    trip_id: uuid.UUID
    day_id: uuid.UUID | None = None
    activity_id: uuid.UUID | None = None
    filename: str
    content_type: str
    file_size_bytes: int


class UploadPresignResponse(BaseModel):
    object_key: str
    upload_url: str
    expires_in: int
    public_url: str


class UploadCompleteRequest(BaseModel):
    trip_id: uuid.UUID
    day_id: uuid.UUID | None = None
    activity_id: uuid.UUID | None = None
    memory_type: str
    object_key: str
    caption: str | None = None
    taken_at: datetime | None = None


class UploadCompleteResponse(BaseModel):
    memory_id: uuid.UUID
    object_key: str


class ImportPresignRequest(BaseModel):
    session_id: str | None = None
    filename: str
    content_type: str
    file_size_bytes: int


class ImportPresignResponse(BaseModel):
    session_id: str
    object_key: str
    upload_url: str
    expires_in: int
    public_url: str


class TripImportRequest(BaseModel):
    session_id: str
    object_keys: list[str]


class TripImportResponse(BaseModel):
    trip_id: uuid.UUID
    job_id: uuid.UUID
    trip_status: str
