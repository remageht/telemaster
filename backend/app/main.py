from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings
from app.core.database import init_db
from app.api import auth, orders, leads, products, telegram

settings = get_settings()
app = FastAPI(title=settings.PROJECT_NAME, version="0.1.0-stage0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    init_db()

@app.get("/health")
def health():
    return {"status": "ok", "stage": 0}

app.include_router(auth.router)
app.include_router(orders.router)
app.include_router(leads.router)
app.include_router(products.router)
app.include_router(telegram.router)
