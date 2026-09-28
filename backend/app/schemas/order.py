from pydantic import BaseModel, Field
from typing import Optional, List

class OrderLine(BaseModel):
    id: str = Field(..., min_length=1, max_length=64)
    name: str = Field(..., min_length=1, max_length=128)
    price: int = Field(..., ge=0)
    qty: int = Field(..., gt=0, le=1000)

class OrderCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    phone: str = Field(..., min_length=7, max_length=32)
    delivery: str = Field(..., min_length=2, max_length=32)
    pay: str = Field(..., min_length=1, max_length=32)
    address: Optional[str] = Field(None, max_length=256)
    comment: Optional[str] = Field(None, max_length=500)
    items: int = Field(..., ge=1)
    subtotal: Optional[int] = Field(0, ge=0)
    fee: Optional[int] = Field(0, ge=0)
    total: Optional[int] = Field(0, ge=0)
    discount: Optional[int] = Field(0, ge=0)
    lines: Optional[List[OrderLine]] = Field(None)

class OrderOut(BaseModel):
    id: int
    no: int
    items: int
    subtotal: int
    fee: int
    total: int
    discount: int = 0
    name: str
    phone: str
    delivery: str
    status: str
    lines: List[OrderLine] = []

    class Config:
        from_attributes = True
