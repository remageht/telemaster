from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.core.database import get_db
from app.core.security import require_admin, mask_phone
from app.models.lead import Lead
from app.schemas.lead import LeadCreate, LeadDoneUpdate
from app.services.notify import notify_admin
import logging

router = APIRouter(prefix="/api/leads", tags=["leads"])
logger = logging.getLogger("uvicorn.error")


@router.post("", status_code=status.HTTP_201_CREATED)
def create_lead(payload: LeadCreate, background: BackgroundTasks, db: Session = Depends(get_db)):
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
    background.add_task(
        notify_admin,
        f"Новая заявка: {lead.name}, {lead.contact}\nКанал: {lead.channel}",
    )
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


@router.patch("/{lead_id}", dependencies=[Depends(require_admin)])
def update_lead(lead_id: int, payload: LeadDoneUpdate, db: Session = Depends(get_db)):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    lead.done = payload.done
    db.commit()
    return {"id": lead.id, "done": lead.done}


@router.delete("/{lead_id}", dependencies=[Depends(require_admin)])
def delete_lead(lead_id: int, db: Session = Depends(get_db)):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    db.delete(lead)
    db.commit()
    return {"status": "deleted", "id": lead_id}
