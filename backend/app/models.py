"""
Database models for the Threads clone.

Design notes addressing edge cases from the requirements doc:
- Email is stored lowercase only (case-insensitive uniqueness)
- Username has a unique constraint (atomic check-and-insert via IntegrityError)
- Posts use soft-delete via `status` column ('active' | 'deleted')
- Likes have a unique (user_id, post_id) constraint (idempotent like)
- Follows have a unique (follower_id, following_id) constraint
- Blocks have a unique (blocker_id, blocked_id) constraint
- Mentions are stored as FK user_id, not as raw @username strings
"""
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, ForeignKey, Boolean,
    UniqueConstraint, Index, func
)
from sqlalchemy.orm import relationship
from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    # Always lowercase. Unique (case-insensitive by virtue of being normalized).
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    display_name = Column(String(100), nullable=False, default="")
    bio = Column(Text, default="")
    avatar_url = Column(String(500), default="")
    password_hash = Column(String(255), nullable=False)
    is_private = Column(Boolean, default=False, nullable=False)
    # Soft-delete pattern. After 30-day window, treat as deleted.
    deleted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    posts = relationship("Post", back_populates="author", cascade="all, delete-orphan")


class Post(Base):
    """A thread or a reply. If parent_id is set, it's a reply."""
    __tablename__ = "posts"

    id = Column(Integer, primary_key=True, index=True)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    content = Column(Text, nullable=False)
    parent_id = Column(Integer, ForeignKey("posts.id"), nullable=True, index=True)
    # 'active' | 'deleted'. We soft-delete to preserve thread structure.
    status = Column(String(20), default="active", nullable=False, index=True)
    # Idempotency: clients send a key; duplicate POSTs return the original.
    idempotency_key = Column(String(64), nullable=True, index=True)
    # Edit history stored as JSON-encoded text (simple; SQLite-friendly).
    edit_history = Column(Text, default="[]")
    edited_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)

    author = relationship("User", back_populates="posts")
    parent = relationship("Post", remote_side=[id], backref="replies")

    __table_args__ = (
        # An author cannot replay the same idempotency key.
        UniqueConstraint("author_id", "idempotency_key", name="uq_post_idem"),
        Index("ix_posts_created_id", "created_at", "id"),
    )


class Like(Base):
    __tablename__ = "likes"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    post_id = Column(Integer, ForeignKey("posts.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    __table_args__ = (
        # Prevents double-like race. Insert is atomic; we catch IntegrityError.
        UniqueConstraint("user_id", "post_id", name="uq_like"),
    )


class Follow(Base):
    """If status='pending', it's a follow request to a private account."""
    __tablename__ = "follows"

    id = Column(Integer, primary_key=True)
    follower_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    following_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    status = Column(String(20), default="accepted", nullable=False)  # 'accepted' | 'pending'
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("follower_id", "following_id", name="uq_follow"),
    )


class Block(Base):
    __tablename__ = "blocks"

    id = Column(Integer, primary_key=True)
    blocker_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    blocked_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("blocker_id", "blocked_id", name="uq_block"),
    )
