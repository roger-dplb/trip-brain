import uuid

from fastapi import HTTPException, status

from app.models.activity import Activity
from app.repositories.activity_repository import ActivityRepository
from app.schemas.activity import ActivityCreate, ActivityUpdate

ALLOWED_ACTIVITY_STATUS = {"planned", "done", "skipped"}


class ActivityService:
    def __init__(self, repository: ActivityRepository):
        self.repository = repository

    def list(
        self,
        day_id: uuid.UUID | None = None,
        status_filter: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Activity]:
        if status_filter and status_filter not in ALLOWED_ACTIVITY_STATUS:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid status filter. Allowed values: {sorted(ALLOWED_ACTIVITY_STATUS)}",
            )
        return self.repository.list(day_id, status_filter, limit, offset)

    def get_or_none(self, activity_id: uuid.UUID) -> Activity | None:
        return self.repository.get(activity_id)

    def create(self, payload: ActivityCreate) -> Activity:
        self._validate_status(payload.status)
        return self.repository.create(payload)

    def update(self, activity: Activity, payload: ActivityUpdate) -> Activity:
        if payload.status is not None:
            self._validate_status(payload.status)
        return self.repository.update(activity, payload)

    def delete(self, activity: Activity) -> None:
        self.repository.delete(activity)

    def _validate_status(self, value: str) -> None:
        if value not in ALLOWED_ACTIVITY_STATUS:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid status. Allowed values: {sorted(ALLOWED_ACTIVITY_STATUS)}",
            )
