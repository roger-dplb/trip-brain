import uuid
from pathlib import Path
from urllib.parse import urlparse, urlunparse

import boto3
from botocore.exceptions import ClientError

from app.core.config import settings


class StorageService:
    def __init__(self) -> None:
        self.bucket = settings.minio_bucket
        self.expires_in_seconds = settings.presigned_expires_in_seconds
        self.public_endpoint = settings.minio_public_endpoint
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.minio_endpoint,
            aws_access_key_id=settings.minio_access_key,
            aws_secret_access_key=settings.minio_secret_key,
            region_name=settings.minio_region,
        )
        self._ensure_bucket()

    def generate_object_key(
        self,
        trip_id: uuid.UUID,
        day_id: uuid.UUID | None,
        activity_id: uuid.UUID | None,
        filename: str,
    ) -> str:
        extension = Path(filename).suffix
        safe_extension = extension if extension else ""
        return (
            f"trips/{trip_id}/"
            f"days/{day_id or 'unassigned'}/"
            f"activities/{activity_id or 'unassigned'}/"
            f"{uuid.uuid4()}{safe_extension}"
        )

    def create_presigned_upload_url(self, object_key: str, content_type: str) -> str:
        internal_url = self.client.generate_presigned_url(
            ClientMethod="put_object",
            Params={
                "Bucket": self.bucket,
                "Key": object_key,
                "ContentType": content_type,
            },
            ExpiresIn=self.expires_in_seconds,
        )
        return self._rewrite_to_public_endpoint(internal_url)

    def _ensure_bucket(self) -> None:
        try:
            self.client.head_bucket(Bucket=self.bucket)
        except ClientError:
            self.client.create_bucket(Bucket=self.bucket)

    def _rewrite_to_public_endpoint(self, internal_url: str) -> str:
        parsed_internal = urlparse(internal_url)
        parsed_public = urlparse(self.public_endpoint)
        return urlunparse(
            (
                parsed_public.scheme,
                parsed_public.netloc,
                parsed_internal.path,
                parsed_internal.params,
                parsed_internal.query,
                parsed_internal.fragment,
            )
        )
