import html
import logging

import httpx

from app.core.config import get_settings

logger = logging.getLogger("uvicorn.error")
settings = get_settings()


def telegram_configured() -> bool:
    return bool(settings.TELEGRAM_BOT_TOKEN and settings.TELEGRAM_CHAT_ID)


def notify_admin(text: str) -> None:
    """Best-effort server-side Telegram notification (never raises)."""
    if not telegram_configured():
        return
    url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
    try:
        r = httpx.post(
            url,
            json={
                "chat_id": settings.TELEGRAM_CHAT_ID,
                "text": html.escape(text),
                "parse_mode": "HTML",
                "disable_web_page_preview": True,
            },
            timeout=5,
        )
        if r.status_code != 200:
            logger.warning("Telegram notify failed: HTTP %s", r.status_code)
    except Exception as e:  # noqa: BLE001 - notification must not break business flow
        logger.warning("Telegram notify failed: %s", e)
