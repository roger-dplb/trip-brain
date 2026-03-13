import uuid
from urllib.parse import urlparse

import pytest
from app.services.storage_service import StorageService
from fastapi import HTTPException


class FakeS3Client:
    def __init__(self, presigned_url: str) -> None:
        self.presigned_url = presigned_url

    def head_bucket(self, Bucket):
        return None

    def create_bucket(self, Bucket):
        return None

    def put_bucket_policy(self, Bucket, Policy):
        return None

    def generate_presigned_url(self, ClientMethod, Params, ExpiresIn):
        return self.presigned_url


def _build_service(monkeypatch) -> StorageService:
    fake_client = FakeS3Client(
        "http://minio:9000/trip-archive/path/to/object.jpg?X-Amz-Signature=123"
    )
    monkeypatch.setattr(
        "app.services.storage_service.boto3.client", lambda *args, **kwargs: fake_client
    )
    return StorageService()


def test_generate_object_key_has_expected_structure(monkeypatch) -> None:
    service = _build_service(monkeypatch)

    object_key = service.generate_object_key(
        trip_id=uuid.UUID("11111111-1111-1111-1111-111111111111"),
        day_id=None,
        activity_id=None,
        filename="photo.jpg",
    )

    assert object_key.startswith(
        "trips/11111111-1111-1111-1111-111111111111/days/unassigned/activities/unassigned/"
    )
    assert object_key.endswith(".jpg")


def test_validate_upload_request_rejects_invalid_content_type(monkeypatch) -> None:
    service = _build_service(monkeypatch)

    with pytest.raises(HTTPException) as exc_info:
        service.validate_upload_request("application/pdf", 1024)

    assert exc_info.value.status_code == 422


def test_validate_upload_request_rejects_invalid_size(monkeypatch) -> None:
    service = _build_service(monkeypatch)

    with pytest.raises(HTTPException) as exc_info:
        service.validate_upload_request("image/jpeg", 0)

    assert exc_info.value.status_code == 422


def test_create_presigned_upload_url_rewrites_host(monkeypatch) -> None:
    service = _build_service(monkeypatch)

    rewritten = service.create_presigned_upload_url("path/to/object.jpg", "image/jpeg")

    parsed = urlparse(rewritten)
    assert parsed.netloc == urlparse(service.public_endpoint).netloc
    assert parsed.path.endswith("/path/to/object.jpg")
