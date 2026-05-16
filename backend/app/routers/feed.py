"""
Feed: home (following) and explore (public latest).

EDGE CASE: feed must apply real-time block filter every request, not from cache.
EDGE CASE: keyset pagination tolerates deleted anchor posts.
"""
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, or_, desc
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, Post, Follow
from ..schemas import PostListOut
from ..auth import get_current_user, get_optional_user
from ..helpers import blocked_user_ids
from .posts import _serialize

router = APIRouter(prefix="/api/feed", tags=["feed"])


def _apply_cursor(q, cursor: Optional[str]):
    if not cursor:
        return q
    try:
        ts_str, last_id = cursor.split("|")
        ts = datetime.fromisoformat(ts_str)
        return q.filter(
            or_(Post.created_at < ts,
                and_(Post.created_at == ts, Post.id < int(last_id)))
        )
    except Exception:
        return q


def _paginate(q, limit: int):
    q = q.order_by(desc(Post.created_at), desc(Post.id)).limit(limit + 1)
    rows = q.all()
    next_cursor = None
    if len(rows) > limit:
        last = rows[limit - 1]
        next_cursor = f"{last.created_at.isoformat()}|{last.id}"
        rows = rows[:limit]
    return rows, next_cursor


@router.get("/home", response_model=PostListOut)
def home_feed(
    cursor: Optional[str] = Query(None),
    limit: int = Query(20, le=50),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Top-level threads from users I follow + my own."""
    following_ids = [
        f.following_id
        for f in db.query(Follow).filter(
            Follow.follower_id == user.id, Follow.status == "accepted"
        ).all()
    ]
    author_ids = list(set(following_ids + [user.id]))

    blocked = blocked_user_ids(db, user.id)
    if blocked:
        author_ids = [aid for aid in author_ids if aid not in blocked]

    q = db.query(Post).filter(
        Post.author_id.in_(author_ids),
        Post.status == "active",
        Post.parent_id.is_(None),
    )
    q = _apply_cursor(q, cursor)
    rows, next_cursor = _paginate(q, limit)
    return PostListOut(items=[_serialize(db, p, user) for p in rows], next_cursor=next_cursor)


@router.get("/explore", response_model=PostListOut)
def explore_feed(
    cursor: Optional[str] = Query(None),
    limit: int = Query(20, le=50),
    db: Session = Depends(get_db),
    viewer: Optional[User] = Depends(get_optional_user),
):
    """Latest top-level threads from public accounts."""
    q = db.query(Post).join(User, Post.author_id == User.id).filter(
        Post.status == "active",
        Post.parent_id.is_(None),
        User.is_private == False,  # noqa: E712
        User.deleted_at.is_(None),
    )
    # EDGE CASE: filter blocked users from explore for logged-in viewer.
    if viewer:
        blocked = blocked_user_ids(db, viewer.id)
        if blocked:
            q = q.filter(~Post.author_id.in_(blocked))

    q = _apply_cursor(q, cursor)
    rows, next_cursor = _paginate(q, limit)
    return PostListOut(items=[_serialize(db, p, viewer) for p in rows], next_cursor=next_cursor)


@router.get("/profile/{username}", response_model=PostListOut)
def profile_feed(
    username: str,
    cursor: Optional[str] = Query(None),
    limit: int = Query(20, le=50),
    db: Session = Depends(get_db),
    viewer: Optional[User] = Depends(get_optional_user),
):
    """Top-level posts on a user's profile."""
    from fastapi import HTTPException
    from ..helpers import can_view_user_content, is_blocked_between

    target = db.query(User).filter(User.username == username).first()
    if not target or target.deleted_at is not None:
        raise HTTPException(404, "User not found")
    if viewer and is_blocked_between(db, viewer.id, target.id):
        raise HTTPException(404, "User not found")
    if not can_view_user_content(db, viewer, target):
        # Private and not following → return empty.
        return PostListOut(items=[], next_cursor=None)

    q = db.query(Post).filter(
        Post.author_id == target.id,
        Post.status == "active",
        Post.parent_id.is_(None),
    )
    q = _apply_cursor(q, cursor)
    rows, next_cursor = _paginate(q, limit)
    return PostListOut(items=[_serialize(db, p, viewer) for p in rows], next_cursor=next_cursor)
