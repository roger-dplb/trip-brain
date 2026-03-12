import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.repositories.memory_repository import MemoryRepository
from app.schemas.memory import MemoryCreate, MemoryRead, MemoryUpdate
from app.services.memory_service import MemoryService

router = APIRouter()


def get_service(db: Session = Depends(get_db)) -> MemoryService:
    return MemoryService(MemoryRepository(db))


@router.get("/", response_model=list[MemoryRead])
def list_memories(
    trip_id: uuid.UUID | None = Query(default=None),
    day_id: uuid.UUID | None = Query(default=None),
    activity_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    service: MemoryService = Depends(get_service),
):
    return service.list(
        trip_id=trip_id,
        day_id=day_id,
        activity_id=activity_id,
        limit=limit,
        offset=offset,
    )


@router.post("/", response_model=MemoryRead, status_code=status.HTTP_201_CREATED)
def create_memory(payload: MemoryCreate, service: MemoryService = Depends(get_service)):
    return service.create(payload)


@router.get("/{memory_id}", response_model=MemoryRead)
def get_memory(memory_id: uuid.UUID, service: MemoryService = Depends(get_service)):
    memory = service.get_or_none(memory_id)
    if not memory:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Memory not found"
        )
    return memory


@router.put("/{memory_id}", response_model=MemoryRead)
def update_memory(
    memory_id: uuid.UUID,
    payload: MemoryUpdate,
    service: MemoryService = Depends(get_service),
):
    memory = service.get_or_none(memory_id)
    if not memory:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Memory not found"
        )
    return service.update(memory, payload)


@router.delete("/{memory_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_memory(memory_id: uuid.UUID, service: MemoryService = Depends(get_service)):
    memory = service.get_or_none(memory_id)
    if not memory:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Memory not found"
        )
    service.delete(memory)
    return None
