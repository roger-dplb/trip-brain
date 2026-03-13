import pytest

from app.core.config import Settings


def _build_settings(**overrides) -> Settings:
    base = {
        "app_name": "Trip Archive API",
        "app_env": "development",
        "database_url": "postgresql+psycopg://trip_user:trip_pass@postgres:5432/trip_archive",
        "cors_origins": "http://localhost:3000",
        "minio_endpoint": "http://minio:9000",
        "minio_public_endpoint": "http://localhost:9000",
        "minio_access_key": "minioadmin",
        "minio_secret_key": "minioadmin",
        "minio_bucket": "trip-archive",
        "minio_region": "us-east-1",
        "presigned_expires_in_seconds": 900,
        "max_upload_size_bytes": 26214400,
        "allowed_upload_content_types": "image/jpeg,image/png",
        "openai_api_key": "",
        "openai_embedding_model": "text-embedding-3-small",
        "itinerary_provider": "openai",
        "itinerary_model": "gpt-5",
        "itinerary_prompt_strategy": "summary-first-day-by-day",
    }
    base.update(overrides)
    return Settings(**base)


def test_validate_sensitive_settings_allows_development_defaults() -> None:
    settings = _build_settings(app_env="development")
    settings.validate_sensitive_settings()


def test_validate_sensitive_settings_blocks_insecure_production_values() -> None:
    settings = _build_settings(app_env="production")

    with pytest.raises(RuntimeError) as exc_info:
        settings.validate_sensitive_settings()

    assert "Insecure sensitive settings for production" in str(exc_info.value)


def test_validate_sensitive_settings_allows_secure_production_values() -> None:
    settings = _build_settings(
        app_env="production",
        database_url="postgresql+psycopg://trip_user:super_secure_password@postgres:5432/trip_archive",
        minio_access_key="triparchive-user",
        minio_secret_key="ultra_secure_minio_password",
    )

    settings.validate_sensitive_settings()
