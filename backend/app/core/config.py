from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine.url import make_url


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

    def is_production(self) -> bool:
        return self.app_env.lower() in {"production", "prod"}

    def validate_sensitive_settings(self) -> None:
        if not self.is_production():
            return

        insecure_values = {
            "minioadmin",
            "trip_pass",
            "changeme",
            "change-me",
            "password",
            "123456",
            "admin",
        }

        insecure_keys = []

        minio_access_key = (self.minio_access_key or "").strip().lower()
        if not minio_access_key or minio_access_key in insecure_values:
            insecure_keys.append("MINIO_ACCESS_KEY")

        minio_secret_key = (self.minio_secret_key or "").strip().lower()
        if not minio_secret_key or minio_secret_key in insecure_values:
            insecure_keys.append("MINIO_SECRET_KEY")

        try:
            db_password_raw = make_url(self.database_url).password or ""
        except Exception:
            db_password_raw = ""

        db_password = db_password_raw.strip().lower()
        if not db_password or db_password in insecure_values:
            insecure_keys.append("DATABASE_URL")

        if insecure_keys:
            raise RuntimeError(
                "Insecure sensitive settings for production: "
                + ", ".join(insecure_keys)
            )


settings = Settings()
