from pydantic import BaseModel, EmailStr, Field, ConfigDict
from typing import Optional, List
from datetime import datetime


# ---------- Auth ----------
class SignupIn(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=30, pattern=r"^[a-zA-Z0-9_]+$")
    password: str = Field(min_length=6, max_length=128)
    display_name: Optional[str] = ""


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ---------- Users ----------
class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    display_name: str
    bio: str
    avatar_url: str
    is_private: bool
    created_at: datetime


class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    is_private: Optional[bool] = None


class ProfileOut(UserPublic):
    follower_count: int
    following_count: int
    post_count: int
    is_following: bool = False
    follow_status: Optional[str] = None  # 'accepted' | 'pending' | None
    is_blocked: bool = False
    is_blocking: bool = False  # i.e., they blocked me


# ---------- Posts ----------
class PostCreate(BaseModel):
    content: str = Field(min_length=1, max_length=500)
    parent_id: Optional[int] = None
    idempotency_key: Optional[str] = Field(default=None, max_length=64)


class PostUpdate(BaseModel):
    content: str = Field(min_length=1, max_length=500)


class PostOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    content: str
    author: UserPublic
    parent_id: Optional[int] = None
    created_at: datetime
    edited_at: Optional[datetime] = None
    like_count: int = 0
    reply_count: int = 0
    liked_by_me: bool = False
    status: str = "active"


class PostListOut(BaseModel):
    items: List[PostOut]
    next_cursor: Optional[str] = None
