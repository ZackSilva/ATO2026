from pathlib import Path

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: SecretStr
    app_origin: str = "http://localhost:3000"
    cookie_secure: bool = False
    session_hours: int = Field(default=24, ge=1, le=168)
    login_attempts: int = Field(default=5, ge=1, le=20)
    login_window_seconds: int = Field(default=900, ge=60, le=86400)
    photo_root: Path = Path("/data/photos")
    cardsight_api_key: SecretStr | None = None

    @field_validator("cardsight_api_key", mode="before")
    @classmethod
    def optional_cardsight_key(cls, value):
        if isinstance(value, str):
            return value.strip() or None
        return value

    @field_validator("database_url")
    @classmethod
    def postgres_only(cls, value: SecretStr) -> SecretStr:
        if not value.get_secret_value().startswith("postgresql+psycopg://"):
            raise ValueError("DATABASE_URL must use postgresql+psycopg://")
        return value

    @field_validator("app_origin")
    @classmethod
    def validate_origin(cls, value: str) -> str:
        from urllib.parse import urlsplit

        parsed = urlsplit(value)
        if (
            parsed.scheme not in ("http", "https")
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.path not in ("", "/")
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("APP_ORIGIN must be a single http(s) origin without a path")
        return value.rstrip("/")

    @model_validator(mode="after")
    def secure_remote_origin(self):
        from urllib.parse import urlsplit

        host = urlsplit(self.app_origin).hostname
        if host not in ("localhost", "127.0.0.1", "[::1]", "::1"):
            if not self.app_origin.startswith("https://") or not self.cookie_secure:
                raise ValueError("Remote deployments require HTTPS and COOKIE_SECURE=true")
        return self
