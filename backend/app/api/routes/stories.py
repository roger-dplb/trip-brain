import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.repositories.memory_repository import MemoryRepository
from app.repositories.story_export_repository import StoryExportRepository
from app.repositories.trip_repository import TripRepository
from app.schemas.stories import StoryExportStatusResponse, StoryExportTriggerResponse
from app.services.storage_service import StorageService

router = APIRouter()

JOB_TYPE_STORIES_EXPORT = "stories_export"


def _enqueue_worker_job(
    db: Session,
    trip_id: uuid.UUID,
    story_export_job_id: uuid.UUID,
) -> None:
    """Insert a pending job into worker_jobs so the worker picks it up."""
    db.execute(
        text("""
            INSERT INTO worker_jobs (
                id, job_type, source_type, source_id,
                status, attempt_count, max_attempts,
                available_at, payload, payload_hash, updated_at
            )
            VALUES (
                gen_random_uuid(), :job_type, 'trip', :source_id,
                'pending', 0, 3,
                now(), :payload::jsonb, 'stories', now()
            )
            ON CONFLICT (job_type, source_type, source_id)
            DO UPDATE SET
                status = 'pending',
                payload = EXCLUDED.payload,
                available_at = now(),
                updated_at = now()
        """),
        {
            "job_type": JOB_TYPE_STORIES_EXPORT,
            "source_id": str(trip_id),
            "payload": f'{{"trip_id": "{trip_id}", "story_export_job_id": "{story_export_job_id}"}}',
        },
    )
    db.commit()


def _build_url(storage: StorageService, key: str | None) -> str | None:
    if not key:
        return None
    return storage.build_public_object_url(key)


@router.post(
    "/{trip_id}/stories/export",
    response_model=StoryExportTriggerResponse,
)
def trigger_stories_export(trip_id: uuid.UUID, db: Session = Depends(get_db)):
    trip_repo = TripRepository(db)
    export_repo = StoryExportRepository(db)
    memory_repo = MemoryRepository(db)
    storage = StorageService()

    trip = trip_repo.get(trip_id)
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found"
        )

    # Check for cached valid export
    existing_job = export_repo.get_by_trip(trip_id)
    if existing_job and existing_job.status == "done":
        last_change = export_repo.get_last_data_change(trip_id)
        if last_change <= existing_job.created_at:
            return StoryExportTriggerResponse(
                job_id=existing_job.id,
                status="done",
                cached=True,
                zip_url=_build_url(storage, existing_job.zip_object_key),
                mp4_url=_build_url(storage, existing_job.mp4_object_key),
            )

    # Validate trip has at least one photo
    all_memories = memory_repo.list(trip_id=trip_id, limit=1000)
    has_photos = any(m.memory_type == "photo" for m in all_memories)
    if not has_photos:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Adicione fotos à viagem antes de exportar Stories",
        )

    # Create or reset the export job
    job = export_repo.upsert_queued(trip_id)
    _enqueue_worker_job(db, trip_id, job.id)

    return Response(
        content=StoryExportTriggerResponse(
            job_id=job.id,
            status="queued",
            cached=False,
        ).model_dump_json(),
        status_code=status.HTTP_202_ACCEPTED,
        media_type="application/json",
    )


@router.get(
    "/{trip_id}/stories/export/{job_id}",
    response_model=StoryExportStatusResponse,
)
def get_stories_export_status(
    trip_id: uuid.UUID, job_id: uuid.UUID, db: Session = Depends(get_db)
):
    trip_repo = TripRepository(db)
    export_repo = StoryExportRepository(db)
    storage = StorageService()

    trip = trip_repo.get(trip_id)
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found"
        )

    job = export_repo.get_by_trip(trip_id)
    if not job or job.id != job_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Export job not found"
        )

    return StoryExportStatusResponse(
        job_id=job.id,
        status=job.status,
        zip_url=_build_url(storage, job.zip_object_key),
        mp4_url=_build_url(storage, job.mp4_object_key),
        error_msg=job.error_msg,
    )
