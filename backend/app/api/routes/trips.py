import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.repositories.activity_repository import ActivityRepository
from app.repositories.day_repository import DayRepository
from app.repositories.memory_repository import MemoryRepository
from app.repositories.trip_repository import TripRepository
from app.schemas.timeline import (
    TimelineActivity,
    TimelineDay,
    TimelineMemory,
    TripTimelineRead,
)
from app.schemas.trip import TripCreate, TripRead, TripUpdate
from app.services.storage_service import StorageService
from app.services.trip_service import TripService

router = APIRouter()


def get_service(db: Session = Depends(get_db)) -> TripService:
    return TripService(TripRepository(db))


@router.get("/", response_model=list[TripRead])
def list_trips(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    destination: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    service: TripService = Depends(get_service),
):
    return service.list(
        limit=limit,
        offset=offset,
        destination=destination,
        status_filter=status_filter,
    )


@router.post("/", response_model=TripRead, status_code=status.HTTP_201_CREATED)
def create_trip(payload: TripCreate, service: TripService = Depends(get_service)):
    return service.create(payload)


@router.get("/{trip_id}", response_model=TripRead)
def get_trip(trip_id: uuid.UUID, service: TripService = Depends(get_service)):
    trip = service.get_or_none(trip_id)
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found"
        )
    return trip


@router.get("/{trip_id}/timeline", response_model=TripTimelineRead)
def get_trip_timeline(trip_id: uuid.UUID, db: Session = Depends(get_db)):
    trip_repository = TripRepository(db)
    trip = trip_repository.get(trip_id)
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found",
        )

    day_repository = DayRepository(db)
    activity_repository = ActivityRepository(db)
    memory_repository = MemoryRepository(db)
    storage_service = StorageService()

    days = day_repository.list(trip_id=trip_id, limit=1000, offset=0)

    timeline_days: list[TimelineDay] = []
    for day in days:
        activities = activity_repository.list(day_id=day.id, limit=1000, offset=0)
        memories = memory_repository.list(
            trip_id=trip_id,
            day_id=day.id,
            limit=1000,
            offset=0,
        )

        timeline_days.append(
            TimelineDay(
                id=day.id,
                day_number=day.day_number,
                date=day.date,
                activities=[
                    TimelineActivity(
                        id=activity.id,
                        title=activity.title,
                        location=activity.location,
                        scheduled_time=activity.scheduled_time,
                        status=activity.status,
                    )
                    for activity in activities
                ],
                memories=[
                    TimelineMemory(
                        id=memory.id,
                        memory_type=memory.memory_type,
                        caption=memory.caption,
                        storage_key=memory.storage_key,
                        public_url=storage_service.build_public_object_url(
                            memory.storage_key
                        ),
                        created_at=memory.created_at,
                    )
                    for memory in memories
                ],
            )
        )

    return TripTimelineRead(trip_id=trip_id, days=timeline_days)


@router.put("/{trip_id}", response_model=TripRead)
def update_trip(
    trip_id: uuid.UUID, payload: TripUpdate, service: TripService = Depends(get_service)
):
    trip = service.get_or_none(trip_id)
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found"
        )
    return service.update(trip, payload)


@router.delete("/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trip(trip_id: uuid.UUID, service: TripService = Depends(get_service)):
    trip = service.get_or_none(trip_id)
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found"
        )
    service.delete(trip)
    return None
