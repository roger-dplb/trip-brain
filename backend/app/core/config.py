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
    itinerary_model: str = "gpt-4o"
    itinerary_prompt_strategy: str = "summary-first-day-by-day"
    couple_auth_enabled: bool = False
    couple_primary_name: str = "partner_a"
    couple_primary_token: str = ""
    couple_primary_username: str = ""
    couple_primary_password: str = ""
    couple_partner_name: str = "partner_b"
    couple_partner_token: str = ""
    couple_partner_username: str = ""
    couple_partner_password: str = ""
    couple_auth_secret: str = ""
    couple_access_token_ttl_minutes: int = 720

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

        if not self.couple_auth_enabled:
            raise RuntimeError(
                "COUPLE_AUTH_ENABLED must be true when APP_ENV=production"
            )

        auth_tokens = {
            "COUPLE_PRIMARY_TOKEN": self.couple_primary_token,
            "COUPLE_PARTNER_TOKEN": self.couple_partner_token,
            "COUPLE_AUTH_SECRET": self.couple_auth_secret,
            "COUPLE_PRIMARY_PASSWORD": self.couple_primary_password,
            "COUPLE_PARTNER_PASSWORD": self.couple_partner_password,
        }
        weak_auth_keys = []
        for key, token in auth_tokens.items():
            token_lc = (token or "").strip().lower()
            if not token_lc or token_lc in insecure_values:
                weak_auth_keys.append(key)

        if weak_auth_keys:
            raise RuntimeError(
                "Insecure couple auth tokens for production: "
                + ", ".join(weak_auth_keys)
            )


settings = Settings()
