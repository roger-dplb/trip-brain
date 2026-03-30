import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.activity import Activity
from app.models.day import Day
from app.models.location import Location
from app.models.trip import Trip
from app.repositories.activity_repository import ActivityRepository
from app.repositories.day_repository import DayRepository
from app.repositories.memory_repository import MemoryRepository
from app.repositories.trip_repository import TripRepository
from app.schemas.location import LocationPatchRequest, LocationResponse
from app.schemas.timeline import (
    TimelineActivity,
    TimelineDay,
    TimelineMemory,
    TripTimelineRead,
)
from app.schemas.trip import TripCreate, TripRead, TripUpdate
from app.schemas.upload import (
    TripAddMediaRequest,
    TripAddMediaResponse,
    TripImportRequest,
    TripImportResponse,
)
from app.services.import_service import enqueue_trip_import, enqueue_trip_media_add
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
                location=LocationResponse.model_validate(day.location)
                if day.location
                else None,
                activities=[
                    TimelineActivity(
                        id=activity.id,
                        title=activity.title,
                        location=activity.location,
                        scheduled_time=activity.scheduled_time,
                        status=activity.status,
                        location_detail=LocationResponse.model_validate(
                            activity.location_detail
                        )
                        if activity.location_detail
                        else None,
                    )
                    for activity in activities
                ],
                memories=[
                    TimelineMemory(
                        id=memory.id,
                        activity_id=memory.activity_id,
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


@router.patch("/{trip_id}/days/{day_id}/location", response_model=LocationResponse)
def patch_day_location(
    trip_id: uuid.UUID,
    day_id: uuid.UUID,
    payload: LocationPatchRequest,
    db: Session = Depends(get_db),
):
    day = db.query(Day).filter(Day.id == day_id, Day.trip_id == trip_id).first()
    if not day:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Day not found"
        )
    loc = Location(
        trip_id=trip_id,
        country=payload.country,
        city=payload.city,
        region=payload.region,
        place_name=payload.place_name,
    )
    db.add(loc)
    db.flush()
    day.location_id = loc.id
    db.commit()
    db.refresh(loc)
    return LocationResponse.model_validate(loc)


@router.patch(
    "/{trip_id}/activities/{activity_id}/location", response_model=LocationResponse
)
def patch_activity_location(
    trip_id: uuid.UUID,
    activity_id: uuid.UUID,
    payload: LocationPatchRequest,
    db: Session = Depends(get_db),
):
    activity = (
        db.query(Activity)
        .join(Day, Day.id == Activity.day_id)
        .filter(Activity.id == activity_id, Day.trip_id == trip_id)
        .first()
    )
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found"
        )
    loc = Location(
        trip_id=trip_id,
        country=payload.country,
        city=payload.city,
        region=payload.region,
        place_name=payload.place_name,
    )
    db.add(loc)
    db.flush()
    activity.location_id = loc.id
    db.commit()
    db.refresh(loc)
    return LocationResponse.model_validate(loc)


@router.post(
    "/import-from-photos",
    response_model=TripImportResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def import_trip_from_photos(
    payload: TripImportRequest,
    db: Session = Depends(get_db),
):
    if not payload.object_keys:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="object_keys must not be empty",
        )

    trip = Trip(
        name="Viagem importada",
        destinations=[],
        start_date=date.today(),
        end_date=date.today(),
        status="importing_from_photos",
        summary=None,
    )
    db.add(trip)
    db.flush()

    job_id = enqueue_trip_import(db, trip.id, payload.object_keys)

    db.refresh(trip)

    return TripImportResponse(
        trip_id=trip.id,
        job_id=job_id,
        trip_status="importing_from_photos",
    )


@router.post(
    "/{trip_id}/add-media",
    response_model=TripAddMediaResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def add_media_to_trip(
    trip_id: uuid.UUID,
    payload: TripAddMediaRequest,
    db: Session = Depends(get_db),
):
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found"
        )
    if not payload.object_keys:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="object_keys must not be empty",
        )
    job_id = enqueue_trip_media_add(db, trip_id, payload.object_keys)
    return TripAddMediaResponse(trip_id=trip_id, job_id=job_id)
