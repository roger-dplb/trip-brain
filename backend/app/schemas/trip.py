import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, field_validator


class TripBase(BaseModel):
    name: str
    destinations: list[str]
    start_date: date
    end_date: date
    summary: str | None = None
    status: str = "planning"


class TripCreate(TripBase):
    @field_validator("destinations")
    @classmethod
    def destinations_not_empty(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("destinations must have at least one item")
        for item in v:
            if len(item) > 120:
                raise ValueError(
                    f"destination item '{item[:30]}...' exceeds 120 characters"
                )
        return v


class TripUpdate(BaseModel):
    name: str | None = None
    destinations: list[str] | None = None
    start_date: date | None = None
    end_date: date | None = None
    summary: str | None = None
    status: str | None = None

    @field_validator("destinations")
    @classmethod
    def destinations_not_empty_if_provided(
        cls, v: list[str] | None
    ) -> list[str] | None:
        if v is not None and len(v) == 0:
            raise ValueError("destinations must have at least one item if provided")
        return v


class TripRead(TripBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
