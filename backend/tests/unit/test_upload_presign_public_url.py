# backend/tests/unit/test_upload_presign_public_url.py

def test_presign_response_includes_public_url() -> None:
    """UploadPresignResponse must include public_url so frontend never constructs MinIO URLs."""
    from app.schemas.upload import UploadPresignResponse

    resp = UploadPresignResponse(
        object_key="trips/abc/cover.jpg",
        upload_url="https://minio.example.com/presigned?sig=x",
        expires_in=900,
        public_url="https://minio.example.com/tripbrain/trips/abc/cover.jpg",
    )
    assert resp.public_url == "https://minio.example.com/tripbrain/trips/abc/cover.jpg"
