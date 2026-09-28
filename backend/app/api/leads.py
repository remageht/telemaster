from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.core.database import get_db
from app.core.security import require_admin, mask_phone
from app.models.lead import Lead
from app.schemas.lead import LeadCreate
import logging

router = APIRouter(prefix="/api/leads", tags=["leads"])
logger = logging.getLogger("uvicorn.error")


@router.post("", status_code=status.HTTP_201_CREATED)
def create_lead(payload: LeadCreate, db: Session = Depends(get_db)):
    lead = Lead(
        name=payload.name,
        contact=payload.contact,
        channel=payload.channel or "Не указано",
        date=datetime.now(timezone.utc).strftime("%d.%m %H:%M"),
        done=False,
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)
    logger.info(f"Lead created: name={lead.name}, contact={mask_phone(lead.contact)}, channel={lead.channel}")
    return {
        "id": lead.id,
        "name": lead.name,
        "contact": lead.contact,
        "channel": lead.channel,
        "date": lead.date,
        "done": lead.done,
    }


@router.get("", dependencies=[Depends(require_admin)])
def list_leads(db: Session = Depends(get_db)):
    leads = db.query(Lead).order_by(Lead.id.desc()).limit(100).all()
    return [
        {
            "id": lead.id,
            "name": lead.name,
            "contact": lead.contact,
            "channel": lead.channel,
            "date": lead.date,
            "done": lead.done,
        }
        for lead in leads
    ]
