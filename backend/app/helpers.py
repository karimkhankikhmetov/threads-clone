"""
Shared helpers. The key one is `viewable_user_filter` — a centralized way to
exclude users that have blocked the requester (and vice versa) from any query.

EDGE CASE PRINCIPLE: block-aware filtering is applied at query time, not as a
post-process. If we forget to apply it, blocked users' content leaks into feeds,
search, hashtag results, etc.
"""
from typing import Optional
from sqlalchemy import select
from sqlalchemy.orm import Session
from .models import User, Block, Follow


def blocked_user_ids(db: Session, user_id: int) -> set[int]:
    """All user_ids the requester cannot see (either direction of block)."""
    rows = db.query(Block).filter(
        (Block.blocker_id == user_id) | (Block.blocked_id == user_id)
    ).all()
    out = set()
    for b in rows:
        out.add(b.blocked_id if b.blocker_id == user_id else b.blocker_id)
    return out


def is_blocked_between(db: Session, a: int, b: int) -> bool:
    """Either direction of block between two users."""
    return db.query(Block).filter(
        ((Block.blocker_id == a) & (Block.blocked_id == b))
        | ((Block.blocker_id == b) & (Block.blocked_id == a))
    ).first() is not None


def is_following(db: Session, follower_id: int, following_id: int) -> Optional[Follow]:
    return db.query(Follow).filter(
        Follow.follower_id == follower_id,
        Follow.following_id == following_id,
    ).first()


def can_view_user_content(db: Session, viewer: Optional[User], target: User) -> bool:
    """
    Can `viewer` see `target`'s posts?
    - Public account → yes (unless blocked).
    - Private account → only if viewer follows them (accepted) or is the owner.
    - Either direction of block → no.
    """
    if target.deleted_at is not None:
        return False
    if viewer is None:
        return not target.is_private
    if viewer.id == target.id:
        return True
    if is_blocked_between(db, viewer.id, target.id):
        return False
    if not target.is_private:
        return True
    f = is_following(db, viewer.id, target.id)
    return f is not None and f.status == "accepted"
