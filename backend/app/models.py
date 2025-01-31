from typing import Optional
from pydantic import BaseModel, EmailStr
from datetime import datetime


class UserResponse(BaseModel):
    email: EmailStr
    name: str | None = None
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
    name: str | None = None
    password: str


class UserDB(BaseModel):
    id: int
    email: str
    name: str | None = None
    disabled: bool = False
    created_at: datetime
    slack_user_id: Optional[str] = None
    slack_team_id: Optional[str] = None
    google_refresh_token: Optional[str] = None
    google_calendar_connected: bool = False
    github_user_id: Optional[str] = None
    github_username: Optional[str] = None
    github_access_token: Optional[str] = None

    class Config:
        orm_mode = True
