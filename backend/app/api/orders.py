from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import require_admin
from app.models.order import Order
from app.models.product import Product
from app.schemas.order import OrderCreate
import json

router = APIRouter(prefix="/api/orders", tags=["orders"])

FREE_FROM = 3000
COURIER_FEE = 490
CRIMEA_FEE = 350
BULK_MIN = 10
BULK_OFF = 0.25

def delivery_fee(method: str, subtotal: int) -> int:
    if method == "pickup" or subtotal >= FREE_FROM:
        return 0
    return CRIMEA_FEE if method == "crimea" else COURIER_FEE

def line_price(price: int, qty: int) -> int:
    return max(1, round(price * (1 - BULK_OFF))) if qty >= BULK_MIN else price

@router.post("", status_code=201)
def create_order(payload: OrderCreate, db: Session = Depends(get_db)):
    raw = payload.model_dump()
    lines_in = raw.get("lines") or []
    # Этап 5: серверный пересчёт и проверка стока
    subtotal = 0
    for ln in lines_in:
        pid = ln.get("id")
        qty = int(ln.get("qty", 0))
        if not pid or qty <= 0:
            raise HTTPException(status_code=400, detail=f"Invalid line {pid}")
        prod = db.query(Product).filter(Product.id == pid).first()
        if prod:
            if prod.stock < qty:
                raise HTTPException(status_code=400, detail=f"Недостаточно на складе: {prod.name} остаток {prod.stock}")
            price = line_price(prod.price, qty)
            subtotal += price * qty
        else:
            # продукта нет в БД (ещё не синхронизирован) — доверяем цене из payload
            price = int(ln.get("price", 0))
            subtotal += price * qty

    fee = delivery_fee(raw.get("delivery", "pickup"), subtotal)
    # скидку пока не считаем серверно (промокоды — отдельно), берём из payload если есть
    discount = int(raw.get("discount", 0) or 0)
    total = subtotal - discount + fee

    last = db.query(Order).order_by(Order.no.desc()).first()
    next_no = (last.no + 1) if last else 1043

    # списание стока
    for ln in lines_in:
        prod = db.query(Product).filter(Product.id == ln.get("id")).first()
        if prod:
            prod.stock -= int(ln.get("qty", 0))
            if prod.stock < 0:
                prod.stock = 0

    order = Order(
        no=next_no,
        items=int(raw.get("items", len(lines_in))),
        subtotal=subtotal,
        fee=fee,
        total=total,
        name=raw.get("name", ""),
        phone=raw.get("phone", ""),
        delivery=raw.get("delivery", ""),
        pay=raw.get("pay", ""),
        address=raw.get("address"),
        comment=raw.get("comment"),
        status="Собирается",
        lines_json=json.dumps(lines_in, ensure_ascii=False),
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return {"id": order.id, "no": order.no, "subtotal": subtotal, "fee": fee, "total": total, "discount": discount, "status": order.status, "lines": json.loads(order.lines_json)}

@router.get("", dependencies=[Depends(require_admin)])
def list_orders(db: Session = Depends(get_db)):
    orders = db.query(Order).order_by(Order.id.desc()).limit(100).all()
    return [
        {"id": o.id, "no": o.no, "items": o.items, "total": o.total, "subtotal": o.subtotal, "fee": o.fee,
         "name": o.name, "phone": o.phone, "delivery": o.delivery, "pay": o.pay, "address": o.address,
         "comment": o.comment, "status": o.status, "lines": o.lines, "created_at": o.created_at.isoformat() if o.created_at else None}
        for o in orders
    ]
