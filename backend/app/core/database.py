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
    from app.core.security import get_password_hash
    Base.metadata.create_all(bind=engine)
    # сид админа для Этапа 2: phone=admin, password=telemaster2026
    try:
        db = SessionLocal()
        if not db.query(User).filter(User.phone == "admin").first():
            db.add(User(phone="admin", name="Admin", password_hash=get_password_hash("telemaster2026"), is_admin=True))
            db.commit()
        db.close()
    except Exception:
        pass
