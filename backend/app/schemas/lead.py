from pydantic import BaseModel, Field
from typing import Optional

class LeadCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=40, description="Lead contact name")
    contact: str = Field(..., min_length=7, max_length=64, description="Phone or email")
    channel: Optional[str] = Field("Не указано", max_length=32)

class LeadOut(BaseModel):
    id: int
    name: str
    contact: str
    channel: str
    date: str
    done: bool

    class Config:
        from_attributes = True
