from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Trip Archive API"
    app_env: str = "development"
    database_url: str = (
        "postgresql+psycopg://trip_user:trip_pass@postgres:5432/trip_archive"
    )
    cors_origins: str = "http://localhost:3000"
    minio_endpoint: str = "http://minio:9000"
    minio_public_endpoint: str = "http://localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "trip-archive"
    minio_region: str = "us-east-1"
    presigned_expires_in_seconds: int = 900
    max_upload_size_bytes: int = 26214400
    allowed_upload_content_types: str = "image/jpeg,image/png,image/webp,video/mp4"
    openai_api_key: str = ""
    openai_embedding_model: str = "text-embedding-3-small"
    itinerary_provider: str = "openai"
    itinerary_model: str = "gpt-5"
    itinerary_prompt_strategy: str = "summary-first-day-by-day"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
