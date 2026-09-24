from pydantic import BaseModel
from typing import Optional

class LeadCreate(BaseModel):
    name: str
    contact: str
    channel: Optional[str] = "Не указано"

class LeadOut(BaseModel):
    id: int
    name: str
    contact: str
    channel: str
    date: str
    done: bool

    class Config:
        from_attributes = True
