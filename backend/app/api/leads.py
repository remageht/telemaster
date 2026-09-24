from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.core.database import get_db
from app.core.security import require_admin
from app.models.lead import Lead
from app.schemas.lead import LeadCreate

router = APIRouter(prefix="/api/leads", tags=["leads"])

@router.post("", status_code=201)
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
    return {"id": lead.id, "name": lead.name, "contact": lead.contact, "channel": lead.channel, "date": lead.date, "done": lead.done}

@router.get("", dependencies=[Depends(require_admin)])
def list_leads(db: Session = Depends(get_db)):
    leads = db.query(Lead).order_by(Lead.id.desc()).limit(100).all()
    return [{"id": l.id, "name": l.name, "contact": l.contact, "channel": l.channel, "date": l.date, "done": l.done} for l in leads]
