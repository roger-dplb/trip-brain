import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.repositories.day_repository import DayRepository
from app.schemas.day import DayCreate, DayRead, DayUpdate
from app.services.day_service import DayService

router = APIRouter()


def get_service(db: Session = Depends(get_db)) -> DayService:
    return DayService(DayRepository(db))


@router.get("/", response_model=list[DayRead])
def list_days(
    trip_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    service: DayService = Depends(get_service),
):
    return service.list(trip_id=trip_id, limit=limit, offset=offset)


@router.post("/", response_model=DayRead, status_code=status.HTTP_201_CREATED)
def create_day(payload: DayCreate, service: DayService = Depends(get_service)):
    return service.create(payload)


@router.get("/{day_id}", response_model=DayRead)
def get_day(day_id: uuid.UUID, service: DayService = Depends(get_service)):
    day = service.get_or_none(day_id)
    if not day:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Day not found"
        )
    return day


@router.put("/{day_id}", response_model=DayRead)
def update_day(
    day_id: uuid.UUID, payload: DayUpdate, service: DayService = Depends(get_service)
):
    day = service.get_or_none(day_id)
    if not day:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Day not found"
        )
    return service.update(day, payload)


@router.delete("/{day_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_day(day_id: uuid.UUID, service: DayService = Depends(get_service)):
    day = service.get_or_none(day_id)
    if not day:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Day not found"
        )
    service.delete(day)
    return None
