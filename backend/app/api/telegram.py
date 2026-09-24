from fastapi import APIRouter, Depends
from pydantic import BaseModel

router = APIRouter(prefix="/api/telegram", tags=["telegram"])

class TelegramSend(BaseModel):
    text: str

@router.post("/send")
def send_telegram(payload: TelegramSend):
    # Этап 3: токен берётся только из env на сервере, клиент не видит его
    return {"status": "stub", "text": payload.text}
