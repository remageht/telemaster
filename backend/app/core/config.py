from pydantic_settings import BaseSettings
from pydantic import field_validator
from functools import lru_cache


class Settings(BaseSettings):
    PROJECT_NAME: str = "ТЕЛЕМАСТЕР API"
    ENVIRONMENT: str = "production"
    DATABASE_URL: str = "sqlite:///./telemaster.db"
    SECRET_KEY: str = "change-me-in-env-demo-only-32-chars"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15  # 15m для access-токена
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7     # 7 дней для refresh-токена
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_CHAT_ID: str = ""
    CORS_ORIGINS: str = "http://localhost:8080,http://127.0.0.1:8080,http://localhost:8000,http://localhost"
    RATE_LIMIT_DEFAULT: str = "20/minute"

    class Config:
        env_file = ".env"
        extra = "ignore"

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, v: str) -> str:
        if len(v.strip()) < 16:
            raise ValueError("SECRET_KEY must be at least 16 characters")
        return v.strip()

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
