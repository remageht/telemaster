from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from .config import get_settings

settings = get_settings()

# SQLite нужен check_same_thread=False; для Postgres — обычный URL
connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(settings.DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from app.models import user, product, order, lead  # noqa: F401
    from app.models.user import User
    from app.models.product import Product
    from app.core.security import get_password_hash
    Base.metadata.create_all(bind=engine)
    # сид админа: логин/пароль из env (ADMIN_PHONE / ADMIN_PASSWORD)
    if settings.ENVIRONMENT == "production" and settings.ADMIN_PASSWORD == "telemaster2026":
        import logging
        logging.getLogger("uvicorn.error").warning(
            "SECURITY: default ADMIN_PASSWORD is used in production. Set ADMIN_PASSWORD in .env"
        )
    try:
        db = SessionLocal()
        if not db.query(User).filter(User.phone == settings.ADMIN_PHONE).first():
            db.add(
                User(
                    phone=settings.ADMIN_PHONE,
                    name="Admin",
                    password_hash=get_password_hash(settings.ADMIN_PASSWORD),
                    is_admin=True,
                )
            )
            db.commit()
        # сид каталога: базовые товары из js/data.js (только недостающие — правки админа не перетираем)
        import json
        from pathlib import Path
        catalog_path = Path(__file__).resolve().parent.parent / "data" / "catalog.json"
        if catalog_path.exists():
            items = json.loads(catalog_path.read_text(encoding="utf-8"))
            existing = {row[0] for row in db.query(Product.id).all()}
            for item in items:
                if item["id"] not in existing:
                    db.add(Product(**item))
            db.commit()
        db.close()
    except Exception:
        pass
