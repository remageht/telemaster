from pydantic import BaseModel, Field
from typing import Optional

class UserCreate(BaseModel):
    phone: str = Field(..., min_length=7, max_length=32, description="User phone number")
    name: str = Field(..., min_length=2, max_length=60, description="Full name")
    password: str = Field(..., min_length=6, max_length=128, description="Password min 6 chars")

class UserLogin(BaseModel):
    phone: str = Field(..., min_length=3, max_length=32)
    password: str = Field(..., min_length=1, max_length=128)

class Token(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"

class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(..., min_length=10, description="Valid JWT refresh token")
