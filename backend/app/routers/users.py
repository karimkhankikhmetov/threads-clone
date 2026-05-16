"""
User profile, follow, unfollow, block, unblock.

EDGE CASES:
- Follow yourself → 422.
- Follow a user who blocked you → 404 (do not leak existence).
- Block removes existing follow in both directions (permanent — unblock does not restore).
- Block auto-rejects pending follow requests.
- Switching from public → private leaves accepted followers; pending stays pending.
- Switching private → public auto-accepts pending requests.
- follower_count is computed via COUNT(*) — never cached as a mutable column.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, Follow, Block, Post
from ..schemas import UserPublic, UserUpdate, ProfileOut
from ..auth import get_current_user, get_optional_user
from ..helpers import is_blocked_between, is_following

router = APIRouter(prefix="/api/users", tags=["users"])


def _profile_payload(db: Session, target: User, viewer: Optional[User]) -> ProfileOut:
    follower_count = db.query(func.count(Follow.id)).filter(
        Follow.following_id == target.id, Follow.status == "accepted"
    ).scalar() or 0
    following_count = db.query(func.count(Follow.id)).filter(
        Follow.follower_id == target.id, Follow.status == "accepted"
    ).scalar() or 0
    post_count = db.query(func.count(Post.id)).filter(
        Post.author_id == target.id, Post.status == "active", Post.parent_id.is_(None)
    ).scalar() or 0

    is_f = False
    f_status = None
    is_blocked = False
    is_blocking = False
    if viewer and viewer.id != target.id:
        f = is_following(db, viewer.id, target.id)
        if f:
            is_f = f.status == "accepted"
            f_status = f.status
        is_blocked = db.query(Block).filter(
            Block.blocker_id == viewer.id, Block.blocked_id == target.id
        ).first() is not None
        is_blocking = db.query(Block).filter(
            Block.blocker_id == target.id, Block.blocked_id == viewer.id
        ).first() is not None

    return ProfileOut(
        id=target.id,
        username=target.username,
        display_name=target.display_name,
        bio=target.bio,
        avatar_url=target.avatar_url,
        is_private=target.is_private,
        created_at=target.created_at,
        follower_count=follower_count,
        following_count=following_count,
        post_count=post_count,
        is_following=is_f,
        follow_status=f_status,
        is_blocked=is_blocked,
        is_blocking=is_blocking,
    )


@router.get("/{username}", response_model=ProfileOut)
def get_profile(
    username: str,
    db: Session = Depends(get_db),
    viewer: Optional[User] = Depends(get_optional_user),
):
    target = db.query(User).filter(User.username == username).first()
    if not target or target.deleted_at is not None:
        raise HTTPException(404, "User not found")
    # EDGE CASE: target has blocked viewer → 404 (not 403, don't confirm existence).
    if viewer and is_blocked_between(db, viewer.id, target.id):
        # Allow viewer to see that *they* blocked target, but hide if *target* blocked viewer.
        blocked_me = db.query(Block).filter(
            Block.blocker_id == target.id, Block.blocked_id == viewer.id
        ).first()
        if blocked_me:
            raise HTTPException(404, "User not found")
    return _profile_payload(db, target, viewer)


@router.patch("/me", response_model=UserPublic)
def update_me(
    payload: UserUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    was_private = user.is_private
    if payload.display_name is not None:
        user.display_name = payload.display_name[:100]
    if payload.bio is not None:
        user.bio = payload.bio[:500]
    if payload.avatar_url is not None:
        user.avatar_url = payload.avatar_url[:500]
    if payload.is_private is not None:
        user.is_private = payload.is_private

    # EDGE CASE: private → public auto-accepts all pending follow requests.
    if was_private and payload.is_private is False:
        db.query(Follow).filter(
            Follow.following_id == user.id, Follow.status == "pending"
        ).update({Follow.status: "accepted"})

    db.commit()
    db.refresh(user)
    return user


@router.post("/{username}/follow", status_code=200)
def follow(
    username: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    target = db.query(User).filter(User.username == username).first()
    if not target or target.deleted_at is not None:
        raise HTTPException(404, "User not found")
    # EDGE CASE: cannot follow yourself.
    if target.id == user.id:
        raise HTTPException(422, "You cannot follow yourself")
    # EDGE CASE: cannot follow someone who blocked you → 404.
    if is_blocked_between(db, user.id, target.id):
        raise HTTPException(404, "User not found")

    existing = is_following(db, user.id, target.id)
    if existing:
        return {"status": existing.status}

    status_val = "pending" if target.is_private else "accepted"
    f = Follow(follower_id=user.id, following_id=target.id, status=status_val)
    db.add(f)
    try:
        db.commit()
    except IntegrityError:
        # Race condition: someone else inserted between our check and insert.
        db.rollback()
        existing = is_following(db, user.id, target.id)
        return {"status": existing.status if existing else "accepted"}
    return {"status": status_val}


@router.delete("/{username}/follow", status_code=200)
def unfollow(
    username: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    target = db.query(User).filter(User.username == username).first()
    if not target:
        # EDGE CASE: unfollowing a deleted account is a no-op (idempotent).
        return {"status": "not_following"}
    db.query(Follow).filter(
        Follow.follower_id == user.id, Follow.following_id == target.id
    ).delete()
    db.commit()
    return {"status": "not_following"}


@router.post("/{username}/block", status_code=200)
def block(
    username: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    target = db.query(User).filter(User.username == username).first()
    if not target or target.deleted_at is not None:
        raise HTTPException(404, "User not found")
    if target.id == user.id:
        raise HTTPException(422, "You cannot block yourself")

    existing = db.query(Block).filter(
        Block.blocker_id == user.id, Block.blocked_id == target.id
    ).first()
    if existing:
        return {"status": "blocked"}

    db.add(Block(blocker_id=user.id, blocked_id=target.id))
    # EDGE CASE: block removes both directions of the follow relationship,
    # and also auto-rejects any pending request from blocked → blocker.
    db.query(Follow).filter(
        ((Follow.follower_id == user.id) & (Follow.following_id == target.id))
        | ((Follow.follower_id == target.id) & (Follow.following_id == user.id))
    ).delete(synchronize_session=False)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
    return {"status": "blocked"}


@router.delete("/{username}/block", status_code=200)
def unblock(
    username: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    target = db.query(User).filter(User.username == username).first()
    if not target:
        # EDGE CASE: idempotent unblock.
        return {"status": "not_blocked"}
    db.query(Block).filter(
        Block.blocker_id == user.id, Block.blocked_id == target.id
    ).delete()
    db.commit()
    # EDGE CASE: unblock does NOT restore the prior follow relationship.
    return {"status": "not_blocked"}


@router.get("/search/{q}")
def search_users(
    q: str,
    db: Session = Depends(get_db),
    viewer: Optional[User] = Depends(get_optional_user),
):
    q = q.strip()
    if not q:
        return {"items": []}
    query = db.query(User).filter(
        User.deleted_at.is_(None),
        (User.username.ilike(f"%{q}%")) | (User.display_name.ilike(f"%{q}%")),
    ).limit(20)
    results = query.all()
    if viewer:
        from ..helpers import blocked_user_ids
        blocked = blocked_user_ids(db, viewer.id)
        results = [u for u in results if u.id not in blocked]
    return {"items": [UserPublic.model_validate(u).model_dump(mode="json") for u in results]}
