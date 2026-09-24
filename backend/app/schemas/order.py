from pydantic import BaseModel
from typing import Optional, List

class OrderLine(BaseModel):
    id: str
    name: str
    price: int
    qty: int

class OrderCreate(BaseModel):
    name: str
    phone: str
    delivery: str
    pay: str
    address: Optional[str] = None
    comment: Optional[str] = None
    items: int
    subtotal: Optional[int] = 0
    fee: Optional[int] = 0
    total: Optional[int] = 0
    lines: Optional[List[OrderLine]] = None

class OrderOut(BaseModel):
    id: int
    no: int
    items: int
    subtotal: int
    fee: int
    total: int
    name: str
    phone: str
    delivery: str
    status: str
    lines: List[OrderLine] = []

    class Config:
        from_attributes = True
