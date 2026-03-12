import uuid

from pydantic import BaseModel, Field


class SemanticQueryRequest(BaseModel):
    trip_id: uuid.UUID
    query: str = Field(min_length=3, max_length=1000)
    top_k: int = Field(default=5, ge=1, le=20)


class SemanticQueryMatch(BaseModel):
    source_type: str
    source_id: uuid.UUID
    content: str
    score: float


class SemanticQueryResponse(BaseModel):
    answer: str
    used_context: bool
    matches: list[SemanticQueryMatch]


class ItineraryGenerationRequest(BaseModel):
    trip_id: uuid.UUID
    preferences: str | None = Field(default=None, max_length=2000)
    max_days: int = Field(default=7, ge=1, le=21)


class ItineraryGenerationResponse(BaseModel):
    itinerary_markdown: str
    provider: str
    model: str
    prompt_strategy: str
    used_summary: bool
