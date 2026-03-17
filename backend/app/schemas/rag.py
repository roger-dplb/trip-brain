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


class ItineraryJobEnqueuedResponse(BaseModel):
    trip_id: uuid.UUID
    job_id: str
    trip_status: str


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    trip_id: uuid.UUID
    message: str = Field(min_length=1, max_length=2000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=50)


class ChatResponse(BaseModel):
    answer: str
    used_context: bool
