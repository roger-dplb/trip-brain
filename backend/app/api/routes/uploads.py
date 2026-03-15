from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.repositories.memory_repository import MemoryRepository
from app.schemas.memory import MemoryCreate
from app.schemas.upload import (
    UploadCompleteRequest,
    UploadCompleteResponse,
    UploadPresignRequest,
    UploadPresignResponse,
)
from app.services.memory_service import MemoryService
from app.services.storage_service import StorageService

router = APIRouter()


def get_memory_service(db: Session = Depends(get_db)) -> MemoryService:
    return MemoryService(MemoryRepository(db))


def get_storage_service() -> StorageService:
    return StorageService()


@router.post(
    "/presign",
    response_model=UploadPresignResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_upload_url(
    payload: UploadPresignRequest,
    storage_service: StorageService = Depends(get_storage_service),
):
    storage_service.validate_upload_request(
        content_type=payload.content_type,
        file_size_bytes=payload.file_size_bytes,
    )

    object_key = storage_service.generate_object_key(
        trip_id=payload.trip_id,
        day_id=payload.day_id,
        activity_id=payload.activity_id,
        filename=payload.filename,
    )
    upload_url = storage_service.create_presigned_upload_url(
        object_key=object_key,
        content_type=payload.content_type,
    )

    public_url = storage_service.build_public_object_url(object_key)

    if not public_url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Storage misconfiguration: could not build public URL for object.",
        )

    return UploadPresignResponse(
        object_key=object_key,
        upload_url=upload_url,
        expires_in=storage_service.expires_in_seconds,
        public_url=public_url,
    )


@router.post(
    "/complete",
    response_model=UploadCompleteResponse,
    status_code=status.HTTP_201_CREATED,
)
def complete_upload(
    payload: UploadCompleteRequest,
    memory_service: MemoryService = Depends(get_memory_service),
):
    memory = memory_service.create(
        MemoryCreate(
            trip_id=payload.trip_id,
            day_id=payload.day_id,
            activity_id=payload.activity_id,
            memory_type=payload.memory_type,
            storage_key=payload.object_key,
            caption=payload.caption,
            taken_at=payload.taken_at,
        )
    )

    return UploadCompleteResponse(memory_id=memory.id, object_key=payload.object_key)
