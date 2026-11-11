import html

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
import httpx
from app.core.config import get_settings
from app.core.security import require_admin

router = APIRouter(prefix="/api/telegram", tags=["telegram"])
settings = get_settings()


class TelegramSend(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)


@router.post("/send", dependencies=[Depends(require_admin)])
async def send_telegram(payload: TelegramSend):
    # Токен только из .env на сервере — клиент его не видит (Network: POST /api/telegram/send)
    if not settings.TELEGRAM_BOT_TOKEN or not settings.TELEGRAM_CHAT_ID:
        # Этап 3: если не настроен — возвращаем stub, не падаем (демо)
        return {"status": "not_configured", "detail": "TELEGRAM_BOT_TOKEN/CHAT_ID not set in .env"}
    url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                url,
                json={
                    "chat_id": settings.TELEGRAM_CHAT_ID,
                    "text": html.escape(payload.text),
                    "parse_mode": "HTML",
                    "disable_web_page_preview": True,
                },
            )
            if r.status_code != 200:
                raise HTTPException(status_code=502, detail=f"Telegram error {r.status_code}: {r.text[:200]}")
            return {"status": "sent", "telegram": r.json()}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
