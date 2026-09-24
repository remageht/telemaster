from pydantic import BaseModel
from typing import Optional

class ProductBase(BaseModel):
    id: str
    name: str
    sku: str
    price: int
    old_price: Optional[int] = None
    stock: int
    desc: Optional[str] = None
    img: Optional[str] = None
    cat_id: str

class ProductCreate(ProductBase):
    pass

class ProductOut(ProductBase):
    class Config:
        from_attributes = True
