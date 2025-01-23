from pydantic import BaseModel, EmailStr
from datetime import datetime


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    email: EmailStr | None = None


class UserCreate(BaseModel):
    email: EmailStr
    password: str


class UserDB(BaseModel):
    id: int
    email: EmailStr
    hashed_password: str
    disabled: bool
    created_at: datetime

    class Config:
        orm_mode = True
