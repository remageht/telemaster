from pydantic import BaseModel, Field
from typing import Optional


class ProductBase(BaseModel):
    id: str = Field(..., min_length=1, max_length=64)
    name: str = Field(..., min_length=2, max_length=128)
    sku: str = Field(..., min_length=1, max_length=64)
    price: int = Field(..., gt=0)
    old_price: Optional[int] = Field(None, ge=0)
    stock: int = Field(..., ge=0)
    desc: Optional[str] = Field(None, max_length=1000)
    img: Optional[str] = Field(None, max_length=512)
    cat_id: str = Field(..., min_length=1, max_length=64)


class ProductCreate(ProductBase):
    pass


class ProductOut(ProductBase):
    class Config:
        from_attributes = True
