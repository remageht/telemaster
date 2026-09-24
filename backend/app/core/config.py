from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    PROJECT_NAME: str = "ТЕЛЕМАСТЕР API"
    # SQLite по умолчанию для Этапа 0; для продакшена задай DATABASE_URL=postgresql://user:pass@host/db
    DATABASE_URL: str = "sqlite:///./telemaster.db"
    SECRET_KEY: str = "change-me-in-env-demo-only-32-chars"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24h для демо
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_CHAT_ID: str = ""
    CORS_ORIGINS: str = "http://localhost:8080,http://127.0.0.1:8080,http://localhost:8000"

    class Config:
        env_file = ".env"
        extra = "ignore"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

@lru_cache
def get_settings() -> Settings:
    return Settings()
