import uuid

from sqlalchemy.orm import Session

from app.models.activity import Activity
from app.schemas.activity import ActivityCreate, ActivityUpdate


class ActivityRepository:
    def __init__(self, db: Session):
        self.db = db

    def list(
        self,
        day_id: uuid.UUID | None = None,
        status: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Activity]:
        query = self.db.query(Activity)
        if day_id:
            query = query.filter(Activity.day_id == day_id)
        if status:
            query = query.filter(Activity.status == status)
        return (
            query.order_by(Activity.created_at.asc()).offset(offset).limit(limit).all()
        )

    def get(self, activity_id: uuid.UUID) -> Activity | None:
        return self.db.query(Activity).filter(Activity.id == activity_id).first()

    def create(self, payload: ActivityCreate) -> Activity:
        activity = Activity(**payload.model_dump())
        self.db.add(activity)
        self.db.commit()
        self.db.refresh(activity)
        return activity

    def update(self, activity: Activity, payload: ActivityUpdate) -> Activity:
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(activity, field, value)
        self.db.add(activity)
        self.db.commit()
        self.db.refresh(activity)
        return activity

    def delete(self, activity: Activity) -> None:
        self.db.delete(activity)
        self.db.commit()
