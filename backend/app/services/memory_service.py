import uuid

from fastapi import HTTPException, status

from app.models.memory import Memory
from app.repositories.activity_repository import ActivityRepository
from app.repositories.day_repository import DayRepository
from app.repositories.memory_repository import MemoryRepository
from app.schemas.memory import MemoryCreate, MemoryUpdate

ALLOWED_MEMORY_TYPES = {"photo", "video", "note"}


class MemoryService:
    def __init__(
        self,
        repository: MemoryRepository,
        activity_repository: ActivityRepository | None = None,
        day_repository: DayRepository | None = None,
    ):
        self.repository = repository
        self.activity_repository = activity_repository
        self.day_repository = day_repository

    def list(
        self,
        trip_id: uuid.UUID | None = None,
        day_id: uuid.UUID | None = None,
        activity_id: uuid.UUID | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Memory]:
        return self.repository.list(trip_id, day_id, activity_id, limit, offset)

    def get_or_none(self, memory_id: uuid.UUID) -> Memory | None:
        return self.repository.get(memory_id)

    def create(self, payload: MemoryCreate) -> Memory:
        self._validate_memory_type(payload.memory_type)
        return self.repository.create(payload)

    def update(self, memory: Memory, payload: MemoryUpdate) -> Memory:
        if payload.memory_type is not None:
            self._validate_memory_type(payload.memory_type)
        return self.repository.update(memory, payload)

    def delete(self, memory: Memory) -> None:
        activity_id = memory.activity_id
        self.repository.delete(memory)

        if activity_id and self.activity_repository and self.day_repository:
            remaining_memories = self.repository.list(activity_id=activity_id, limit=1)
            if not remaining_memories:
                activity = self.activity_repository.get(activity_id)
                if activity:
                    parent_day_id = activity.day_id
                    self.activity_repository.delete(activity)
                    remaining_activities = self.activity_repository.list(day_id=parent_day_id, limit=1)
                    remaining_day_memories = self.repository.list(day_id=parent_day_id, limit=1)
                    if not remaining_activities and not remaining_day_memories:
                        day = self.day_repository.get(parent_day_id)
                        if day:
                            self.day_repository.delete(day)

    def _validate_memory_type(self, memory_type: str) -> None:
        if memory_type not in ALLOWED_MEMORY_TYPES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid memory_type. Allowed values: {sorted(ALLOWED_MEMORY_TYPES)}",
            )
