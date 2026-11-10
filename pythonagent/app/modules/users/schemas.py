from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr = Field(max_length=254)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str | None
    email: str
    created_at: datetime
