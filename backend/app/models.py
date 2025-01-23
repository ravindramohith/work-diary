from pydantic import BaseModel, EmailStr
from datetime import datetime


class UserResponse(BaseModel):
    email: EmailStr
    slack_user_id: str | None = None
    slack_team_id: str | None = None


class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


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
    slack_user_id: str | None = None

    class Config:
        orm_mode = True
