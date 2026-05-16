"""
Auth routes.

EDGE CASES handled here:
- Email is normalized to lowercase before uniqueness check (case-insensitive).
- Race condition on signup: we don't pre-check then insert; we just attempt
  the INSERT and catch IntegrityError → 409.
- Deactivated/deleted account login is blocked.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..schemas import SignupIn, LoginIn, TokenOut, UserPublic
from ..auth import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/signup", response_model=TokenOut, status_code=201)
def signup(payload: SignupIn, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    username = payload.username.strip()

    user = User(
        email=email,
        username=username,
        display_name=(payload.display_name or username).strip(),
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        # Atomic conflict — we don't say which field to prevent enumeration.
        raise HTTPException(status.HTTP_409_CONFLICT, "Email or username already taken")
    db.refresh(user)
    return TokenOut(access_token=create_access_token(user.id))


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        # Generic message — don't leak whether the email exists.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    if user.deleted_at is not None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account is deactivated")
    return TokenOut(access_token=create_access_token(user.id))


@router.get("/me", response_model=UserPublic)
def me(user: User = Depends(get_current_user)):
    return user
