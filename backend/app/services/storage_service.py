import json
import uuid
from pathlib import Path
from urllib.parse import urlparse, urlunparse

import boto3
from botocore.exceptions import ClientError
from fastapi import HTTPException, status

from app.core.config import settings


class StorageService:
    def __init__(self) -> None:
        self.bucket = settings.minio_bucket
        self.expires_in_seconds = settings.presigned_expires_in_seconds
        self.public_endpoint = settings.minio_public_endpoint
        self.max_upload_size_bytes = settings.max_upload_size_bytes
        self.allowed_content_types = {
            value.strip()
            for value in settings.allowed_upload_content_types.split(",")
            if value.strip()
        }
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

    def generate_import_object_key(self, session_id: str, filename: str) -> str:
        extension = Path(filename).suffix
        safe_extension = extension if extension else ""
        return f"imports/{session_id}/{uuid.uuid4()}{safe_extension}"

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

    def build_public_object_url(self, object_key: str | None) -> str | None:
        if not object_key:
            return None

        base_endpoint = self.public_endpoint.rstrip("/")
        return f"{base_endpoint}/{self.bucket}/{object_key.lstrip('/')}"

    def validate_upload_request(self, content_type: str, file_size_bytes: int) -> None:
        if content_type not in self.allowed_content_types:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "Invalid content_type. Allowed values: "
                    f"{sorted(self.allowed_content_types)}"
                ),
            )

        if file_size_bytes <= 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="file_size_bytes must be greater than zero",
            )

        if file_size_bytes > self.max_upload_size_bytes:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "File is too large. Maximum allowed bytes: "
                    f"{self.max_upload_size_bytes}"
                ),
            )

    def _ensure_bucket(self) -> None:
        try:
            self.client.head_bucket(Bucket=self.bucket)
        except ClientError:
            self.client.create_bucket(Bucket=self.bucket)

        public_read_policy = json.dumps(
            {
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Principal": {"AWS": ["*"]},
                        "Action": ["s3:GetObject"],
                        "Resource": [f"arn:aws:s3:::{self.bucket}/*"],
                    }
                ],
            }
        )
        self.client.put_bucket_policy(Bucket=self.bucket, Policy=public_read_policy)

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
