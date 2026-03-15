import uuid

from pydantic import BaseModel, ConfigDict


class LocationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    country: str
    city: str
    region: str | None
    place_name: str | None


class LocationPatchRequest(BaseModel):
    country: str
    city: str
    region: str | None = None
    place_name: str | None = None
