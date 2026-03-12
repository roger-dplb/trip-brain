import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.repositories.activity_repository import ActivityRepository
from app.schemas.activity import ActivityCreate, ActivityRead, ActivityUpdate
from app.services.activity_service import ActivityService

router = APIRouter()


def get_service(db: Session = Depends(get_db)) -> ActivityService:
    return ActivityService(ActivityRepository(db))


@router.get("/", response_model=list[ActivityRead])
def list_activities(
    day_id: uuid.UUID | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    service: ActivityService = Depends(get_service),
):
    return service.list(
        day_id=day_id,
        status_filter=status_filter,
        limit=limit,
        offset=offset,
    )


@router.post("/", response_model=ActivityRead, status_code=status.HTTP_201_CREATED)
def create_activity(
    payload: ActivityCreate, service: ActivityService = Depends(get_service)
):
    return service.create(payload)


@router.get("/{activity_id}", response_model=ActivityRead)
def get_activity(
    activity_id: uuid.UUID, service: ActivityService = Depends(get_service)
):
    activity = service.get_or_none(activity_id)
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found"
        )
    return activity


@router.put("/{activity_id}", response_model=ActivityRead)
def update_activity(
    activity_id: uuid.UUID,
    payload: ActivityUpdate,
    service: ActivityService = Depends(get_service),
):
    activity = service.get_or_none(activity_id)
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found"
        )
    return service.update(activity, payload)


@router.delete("/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_activity(
    activity_id: uuid.UUID, service: ActivityService = Depends(get_service)
):
    activity = service.get_or_none(activity_id)
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found"
        )
    service.delete(activity)
    return None
