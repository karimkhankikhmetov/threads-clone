"""
Posts (threads) and replies.

EDGE CASES:
- Idempotency key prevents duplicate post on double-tap. Same key → original post.
- Soft delete preserves thread structure. Deleted parent shows placeholder, replies survive.
- Edit history is stored, not silently overwritten.
- Block-aware: cannot view, like, reply to posts from someone who blocked you.
- Private account: only followers can see posts.
- Cursor pagination tolerates the anchor post being deleted (keyset on created_at, id).
"""
import json
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, and_, or_, desc
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, Post, Like
from ..schemas import PostCreate, PostUpdate, PostOut, PostListOut, UserPublic
from ..auth import get_current_user, get_optional_user
from ..helpers import can_view_user_content, is_blocked_between, blocked_user_ids

router = APIRouter(prefix="/api/posts", tags=["posts"])


def _serialize(db: Session, post: Post, viewer: Optional[User]) -> PostOut:
    like_count = db.query(func.count(Like.id)).filter(Like.post_id == post.id).scalar() or 0
    reply_count = db.query(func.count(Post.id)).filter(
        Post.parent_id == post.id, Post.status == "active"
    ).scalar() or 0
    liked_by_me = False
    if viewer:
        liked_by_me = db.query(Like).filter(
            Like.user_id == viewer.id, Like.post_id == post.id
        ).first() is not None

    # Soft-deleted post → placeholder content (preserves reply context).
    content = post.content if post.status == "active" else "[Post deleted]"

    return PostOut(
        id=post.id,
        content=content,
        author=UserPublic.model_validate(post.author),
        parent_id=post.parent_id,
        created_at=post.created_at,
        edited_at=post.edited_at,
        like_count=like_count,
        reply_count=reply_count,
        liked_by_me=liked_by_me,
        status=post.status,
    )


@router.post("", response_model=PostOut, status_code=201)
def create_post(
    payload: PostCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # EDGE CASE: idempotency. If client retried with same key, return original.
    if payload.idempotency_key:
        existing = db.query(Post).filter(
            Post.author_id == user.id,
            Post.idempotency_key == payload.idempotency_key,
        ).first()
        if existing:
            return _serialize(db, existing, user)

    parent = None
    if payload.parent_id is not None:
        parent = db.query(Post).filter(Post.id == payload.parent_id).first()
        if not parent or parent.status != "active":
            raise HTTPException(404, "Parent post not found")
        # EDGE CASE: cannot reply to a post whose author has blocked you.
        if is_blocked_between(db, user.id, parent.author_id):
            raise HTTPException(404, "Parent post not found")
        # EDGE CASE: cannot reply to a private account you don't follow.
        if not can_view_user_content(db, user, parent.author):
            raise HTTPException(404, "Parent post not found")

    post = Post(
        author_id=user.id,
        content=payload.content,
        parent_id=payload.parent_id,
        idempotency_key=payload.idempotency_key,
    )
    db.add(post)
    try:
        db.commit()
    except IntegrityError:
        # Race on idempotency_key — return the now-existing one.
        db.rollback()
        existing = db.query(Post).filter(
            Post.author_id == user.id,
            Post.idempotency_key == payload.idempotency_key,
        ).first()
        if existing:
            return _serialize(db, existing, user)
        raise HTTPException(409, "Duplicate")
    db.refresh(post)
    return _serialize(db, post, user)


@router.get("/{post_id}", response_model=PostOut)
def get_post(
    post_id: int,
    db: Session = Depends(get_db),
    viewer: Optional[User] = Depends(get_optional_user),
):
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(404, "Post not found")
    # Block check runs on every read.
    if viewer and is_blocked_between(db, viewer.id, post.author_id):
        raise HTTPException(404, "Post not found")
    if not can_view_user_content(db, viewer, post.author):
        raise HTTPException(404, "Post not found")
    return _serialize(db, post, viewer)


@router.get("/{post_id}/replies", response_model=PostListOut)
def get_replies(
    post_id: int,
    cursor: Optional[str] = Query(None),
    limit: int = Query(20, le=50),
    db: Session = Depends(get_db),
    viewer: Optional[User] = Depends(get_optional_user),
):
    parent = db.query(Post).filter(Post.id == post_id).first()
    if not parent:
        raise HTTPException(404, "Post not found")
    if viewer and is_blocked_between(db, viewer.id, parent.author_id):
        raise HTTPException(404, "Post not found")
    if not can_view_user_content(db, viewer, parent.author):
        raise HTTPException(404, "Post not found")

    q = db.query(Post).filter(
        Post.parent_id == post_id, Post.status == "active"
    )
    # Filter blocked users from reply list.
    if viewer:
        blocked = blocked_user_ids(db, viewer.id)
        if blocked:
            q = q.filter(~Post.author_id.in_(blocked))

    # Keyset cursor: "created_at_iso|id"
    if cursor:
        try:
            ts_str, last_id = cursor.split("|")
            ts = datetime.fromisoformat(ts_str)
            q = q.filter(
                or_(Post.created_at < ts,
                    and_(Post.created_at == ts, Post.id < int(last_id)))
            )
        except Exception:
            pass

    q = q.order_by(desc(Post.created_at), desc(Post.id)).limit(limit + 1)
    rows = q.all()
    next_cursor = None
    if len(rows) > limit:
        last = rows[limit - 1]
        next_cursor = f"{last.created_at.isoformat()}|{last.id}"
        rows = rows[:limit]
    return PostListOut(
        items=[_serialize(db, p, viewer) for p in rows],
        next_cursor=next_cursor,
    )


@router.patch("/{post_id}", response_model=PostOut)
def edit_post(
    post_id: int,
    payload: PostUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post or post.status != "active":
        raise HTTPException(404, "Post not found")
    if post.author_id != user.id:
        raise HTTPException(403, "Not your post")
    # EDGE CASE: append to edit_history rather than silently overwriting.
    history = []
    try:
        history = json.loads(post.edit_history or "[]")
    except json.JSONDecodeError:
        history = []
    history.append({"content": post.content, "edited_at": datetime.utcnow().isoformat()})
    post.edit_history = json.dumps(history)
    post.content = payload.content
    post.edited_at = datetime.utcnow()
    db.commit()
    db.refresh(post)
    return _serialize(db, post, user)


@router.delete("/{post_id}", status_code=200)
def delete_post(
    post_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        # Idempotent: deleting an already-deleted post is fine.
        return {"status": "deleted"}
    if post.author_id != user.id:
        raise HTTPException(403, "Not your post")
    # EDGE CASE: soft delete. Replies remain visible; parent shows placeholder.
    post.status = "deleted"
    db.commit()
    return {"status": "deleted"}


@router.post("/{post_id}/like", status_code=200)
def like_post(
    post_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post or post.status != "active":
        raise HTTPException(404, "Post not found")
    # EDGE CASE: cannot like a post by someone who blocked you, or vice versa.
    if is_blocked_between(db, user.id, post.author_id):
        raise HTTPException(404, "Post not found")
    if not can_view_user_content(db, user, post.author):
        raise HTTPException(404, "Post not found")

    db.add(Like(user_id=user.id, post_id=post.id))
    try:
        db.commit()
    except IntegrityError:
        # EDGE CASE: double-like race. Unique constraint protects us; idempotent 200.
        db.rollback()
    return {"liked": True}


@router.delete("/{post_id}/like", status_code=200)
def unlike_post(
    post_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # EDGE CASE: unliking a post we never liked is idempotent.
    db.query(Like).filter(Like.user_id == user.id, Like.post_id == post_id).delete()
    db.commit()
    return {"liked": False}
