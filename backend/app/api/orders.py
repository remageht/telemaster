from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import update
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import require_admin, mask_phone
from app.models.order import Order
from app.models.product import Product
from app.schemas.order import OrderCreate, OrderStatusUpdate
from app.services.notify import notify_admin
import json
import logging

router = APIRouter(prefix="/api/orders", tags=["orders"])
logger = logging.getLogger("uvicorn.error")

FREE_FROM = 3000
COURIER_FEE = 490
CRIMEA_FEE = 350
BULK_MIN = 10
BULK_OFF = 0.25
# серверный whitelist промокодов: клиентский discount игнорируется
PROMOS = {"TELE10": 10}


def delivery_fee(method: str, subtotal: int) -> int:
    if method == "pickup" or subtotal >= FREE_FROM:
        return 0
    return CRIMEA_FEE if method == "crimea" else COURIER_FEE


def line_price(price: int, qty: int) -> int:
    return max(1, round(price * (1 - BULK_OFF))) if qty >= BULK_MIN else price


def promo_discount(subtotal: int, code: str | None) -> int:
    pct = PROMOS.get((code or "").strip().upper())
    return round(subtotal * pct / 100) if pct else 0


@router.post("", status_code=status.HTTP_201_CREATED)
def create_order(payload: OrderCreate, background: BackgroundTasks, db: Session = Depends(get_db)):
    raw = payload.model_dump()
    lines_in = raw.get("lines") or []
    if not lines_in:
        raise HTTPException(status_code=400, detail="Пустой заказ")

    priced: list[tuple[Product, int]] = []
    server_lines: list[dict] = []
    subtotal = 0
    for ln in lines_in:
        pid = ln.get("id")
        qty = int(ln.get("qty", 0))
        if not pid or qty <= 0:
            raise HTTPException(status_code=400, detail=f"Invalid line {pid}")
        prod = db.query(Product).filter(Product.id == pid).first()
        if not prod:
            raise HTTPException(status_code=400, detail=f"Товар не найден: {pid}")
        if prod.stock < qty:
            raise HTTPException(status_code=400, detail=f"Недостаточно на складе: {prod.name} остаток {prod.stock}")
        unit = line_price(prod.price, qty)
        subtotal += unit * qty
        priced.append((prod, qty))
        server_lines.append({"id": prod.id, "name": prod.name, "price": unit, "qty": qty})

    fee = delivery_fee(raw.get("delivery", "pickup"), subtotal)
    discount = promo_discount(subtotal, raw.get("promo"))
    total = max(0, subtotal - discount + fee)

    # атомарное списание стока + вставка заказа в одной транзакции
    order = None
    for _ in range(3):
        for prod, qty in priced:
            res = db.execute(
                update(Product)
                .where(Product.id == prod.id, Product.stock >= qty)
                .values(stock=Product.stock - qty)
            )
            if res.rowcount != 1:
                db.rollback()
                raise HTTPException(status_code=400, detail=f"Недостаточно на складе: {prod.name}")
        last = db.query(Order).order_by(Order.no.desc()).first()
        next_no = (last.no + 1) if last else 1043
        order = Order(
            no=next_no,
            items=sum(qty for _, qty in priced),
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
            lines_json=json.dumps(server_lines, ensure_ascii=False),
        )
        db.add(order)
        try:
            db.commit()
            break
        except Exception:
            db.rollback()
            order = None
    if order is None:
        raise HTTPException(status_code=409, detail="Не удалось создать заказ, попробуйте ещё раз")

    db.refresh(order)
    logger.info(f"Order #{order.no} created: total={total} RUB, phone={mask_phone(order.phone)}")
    items_text = ", ".join(f"{p.name} x{qty}" for p, qty in priced)
    background.add_task(
        notify_admin,
        f"Новый заказ № {order.no} на {total} RUB\n{order.name}, {order.phone}\n{items_text}",
    )
    return {
        "id": order.id,
        "no": order.no,
        "subtotal": subtotal,
        "fee": fee,
        "total": total,
        "discount": discount,
        "status": order.status,
        "lines": json.loads(order.lines_json),
    }


@router.get("", dependencies=[Depends(require_admin)])
def list_orders(db: Session = Depends(get_db)):
    orders = db.query(Order).order_by(Order.id.desc()).limit(100).all()
    return [
        {
            "id": o.id,
            "no": o.no,
            "items": o.items,
            "total": o.total,
            "subtotal": o.subtotal,
            "fee": o.fee,
            "name": o.name,
            "phone": o.phone,
            "delivery": o.delivery,
            "pay": o.pay,
            "address": o.address,
            "comment": o.comment,
            "status": o.status,
            "lines": o.lines,
            "created_at": o.created_at.isoformat() if o.created_at else None,
        }
        for o in orders
    ]


@router.patch("/{order_id}", dependencies=[Depends(require_admin)])
def update_order_status(order_id: int, payload: OrderStatusUpdate, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    order.status = payload.status
    db.commit()
    return {"id": order.id, "status": order.status}


@router.delete("/{order_id}", dependencies=[Depends(require_admin)])
def delete_order(order_id: int, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    db.delete(order)
    db.commit()
    return {"status": "deleted", "id": order_id}
