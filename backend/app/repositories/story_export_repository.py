import uuid
from datetime import datetime

from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.models.story_export_job import StoryExportJob


class StoryExportRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_trip(self, trip_id: uuid.UUID) -> StoryExportJob | None:
        return (
            self.db.query(StoryExportJob)
            .filter(StoryExportJob.trip_id == trip_id)
            .first()
        )

    def upsert_queued(self, trip_id: uuid.UUID) -> StoryExportJob:
        """Insert a new job or reset an existing one to queued status."""
        job_id = uuid.uuid4()
        self.db.execute(
            text("""
                INSERT INTO story_export_jobs (id, trip_id, status, created_at)
                VALUES (:id, :trip_id, 'queued', now())
                ON CONFLICT (trip_id) DO UPDATE
                SET status = 'queued',
                    error_msg = NULL,
                    zip_object_key = NULL,
                    mp4_object_key = NULL,
                    created_at = now()
            """),
            {"id": job_id, "trip_id": trip_id},
        )
        self.db.flush()
        return self.get_by_trip(trip_id)  # type: ignore[return-value]

    def get_last_data_change(self, trip_id: uuid.UUID) -> datetime:
        """Return the timestamp of the most recent data change for this trip."""
        result = self.db.execute(
            text("""
                SELECT GREATEST(
                    t.updated_at,
                    COALESCE(MAX(m.created_at), t.updated_at)
                ) AS last_change
                FROM trips t
                LEFT JOIN memories m ON m.trip_id = t.id
                WHERE t.id = :trip_id
                GROUP BY t.updated_at
            """),
            {"trip_id": trip_id},
        ).fetchone()
        return result[0] if result else func.now()

    def mark_processing(self, job_id: uuid.UUID) -> None:
        job = self.db.query(StoryExportJob).filter(StoryExportJob.id == job_id).first()
        if job:
            job.status = "processing"
            self.db.flush()

    def mark_done(
        self, job_id: uuid.UUID, zip_object_key: str, mp4_object_key: str
    ) -> None:
        job = self.db.query(StoryExportJob).filter(StoryExportJob.id == job_id).first()
        if job:
            job.status = "done"
            job.zip_object_key = zip_object_key
            job.mp4_object_key = mp4_object_key
            self.db.commit()

    def mark_failed(self, job_id: uuid.UUID, error_msg: str) -> None:
        job = self.db.query(StoryExportJob).filter(StoryExportJob.id == job_id).first()
        if job:
            job.status = "failed"
            job.error_msg = error_msg[:2000]
            self.db.commit()
