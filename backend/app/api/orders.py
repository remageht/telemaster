from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import require_admin
from app.models.order import Order
from app.schemas.order import OrderCreate
import json

router = APIRouter(prefix="/api/orders", tags=["orders"])

@router.post("", status_code=201)
def create_order(payload: OrderCreate, db: Session = Depends(get_db)):
    # Этап 1: сервер принимает то что прислал фронт, fee/total пересчитает фронт, но сохраняем как есть
    # Этап 5: здесь будет проверка стока и пересчёт.
    last = db.query(Order).order_by(Order.no.desc()).first()
    next_no = (last.no + 1) if last else 1043
    # Заглушка для расчета — если lines нет, считаем по payload
    subtotal = 0
    fee = 0
    total = 0
    lines = []
    # фронт шлёт lines через payload, но схема OrderCreate пока без них — достаём из raw
    # Чтобы не ломать, пробуем взять из payload dict
    raw = payload.model_dump()
    # если фронт прислал lines/total, сохраним
    order = Order(
        no=next_no,
        items=raw.get("items", 0),
        subtotal=raw.get("subtotal", 0),
        fee=raw.get("fee", 0),
        total=raw.get("total", 0) or raw.get("subtotal", 0),
        name=raw.get("name", ""),
        phone=raw.get("phone", ""),
        delivery=raw.get("delivery", ""),
        pay=raw.get("pay", ""),
        address=raw.get("address"),
        comment=raw.get("comment"),
        status="Собирается",
        lines_json=json.dumps(raw.get("lines", []), ensure_ascii=False),
    )
    # если total не передан, считаем как subtotal+fee
    if not order.total:
        order.total = (order.subtotal or 0) + (order.fee or 0)
    db.add(order)
    db.commit()
    db.refresh(order)
    return {"id": order.id, "no": order.no, "total": order.total, "status": order.status, "lines": json.loads(order.lines_json)}

@router.get("", dependencies=[Depends(require_admin)])
def list_orders(db: Session = Depends(get_db)):
    orders = db.query(Order).order_by(Order.id.desc()).limit(100).all()
    return [
        {"id": o.id, "no": o.no, "items": o.items, "total": o.total, "subtotal": o.subtotal, "fee": o.fee,
         "name": o.name, "phone": o.phone, "delivery": o.delivery, "pay": o.pay, "address": o.address,
         "comment": o.comment, "status": o.status, "lines": o.lines, "created_at": o.created_at.isoformat() if o.created_at else None}
        for o in orders
    ]
