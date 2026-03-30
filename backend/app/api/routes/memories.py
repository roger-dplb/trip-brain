import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.repositories.activity_repository import ActivityRepository
from app.repositories.day_repository import DayRepository
from app.repositories.memory_repository import MemoryRepository
from app.schemas.memory import MemoryCreate, MemoryRead, MemoryUpdate
from app.services.memory_service import MemoryService
from app.services.storage_service import StorageService

router = APIRouter()


def get_service(db: Session = Depends(get_db)) -> MemoryService:
    return MemoryService(
        MemoryRepository(db),
        activity_repository=ActivityRepository(db),
        day_repository=DayRepository(db),
    )


def get_storage_service() -> StorageService:
    return StorageService()


@router.get("/", response_model=list[MemoryRead])
def list_memories(
    trip_id: uuid.UUID | None = Query(default=None),
    day_id: uuid.UUID | None = Query(default=None),
    activity_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    service: MemoryService = Depends(get_service),
    storage_service: StorageService = Depends(get_storage_service),
):
    memories = service.list(
        trip_id=trip_id,
        day_id=day_id,
        activity_id=activity_id,
        limit=limit,
        offset=offset,
    )
    return [
        MemoryRead.model_validate(memory, from_attributes=True).model_copy(
            update={
                "public_url": storage_service.build_public_object_url(
                    memory.storage_key
                )
            }
        )
        for memory in memories
    ]


@router.post("/", response_model=MemoryRead, status_code=status.HTTP_201_CREATED)
def create_memory(
    payload: MemoryCreate,
    service: MemoryService = Depends(get_service),
    storage_service: StorageService = Depends(get_storage_service),
):
    memory = service.create(payload)
    return MemoryRead.model_validate(memory, from_attributes=True).model_copy(
        update={
            "public_url": storage_service.build_public_object_url(memory.storage_key)
        }
    )


@router.get("/{memory_id}", response_model=MemoryRead)
def get_memory(
    memory_id: uuid.UUID,
    service: MemoryService = Depends(get_service),
    storage_service: StorageService = Depends(get_storage_service),
):
    memory = service.get_or_none(memory_id)
    if not memory:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Memory not found"
        )
    return MemoryRead.model_validate(memory, from_attributes=True).model_copy(
        update={
            "public_url": storage_service.build_public_object_url(memory.storage_key)
        }
    )


@router.put("/{memory_id}", response_model=MemoryRead)
def update_memory(
    memory_id: uuid.UUID,
    payload: MemoryUpdate,
    service: MemoryService = Depends(get_service),
    storage_service: StorageService = Depends(get_storage_service),
):
    memory = service.get_or_none(memory_id)
    if not memory:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Memory not found"
        )
    updated_memory = service.update(memory, payload)
    return MemoryRead.model_validate(updated_memory, from_attributes=True).model_copy(
        update={
            "public_url": storage_service.build_public_object_url(
                updated_memory.storage_key
            )
        }
    )


@router.delete("/{memory_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_memory(memory_id: uuid.UUID, service: MemoryService = Depends(get_service)):
    memory = service.get_or_none(memory_id)
    if not memory:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Memory not found"
        )
    service.delete(memory)
    return None
