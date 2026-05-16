import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth.jsx";

function timeAgo(iso) {
  const d = new Date(iso);
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d`;
  return d.toLocaleDateString();
}

function Avatar({ user, size = 40 }) {
  const initial = (user?.display_name || user?.username || "?")[0]?.toUpperCase();
  if (user?.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt=""
        style={{ width: size, height: size }}
        className="rounded-full object-cover bg-zinc-800"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.45 }}
      className="rounded-full bg-zinc-700 flex items-center justify-center font-semibold"
    >
      {initial}
    </div>
  );
}

export default function ThreadCard({ post, onChange }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [liked, setLiked] = useState(post.liked_by_me);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(post.content);

  const isOwner = user && user.id === post.author.id;
  const isDeleted = post.status === "deleted";

  const toggleLike = async (e) => {
    e.stopPropagation();
    if (busy || isDeleted) return;
    setBusy(true);
    const prev = liked;
    setLiked(!prev);
    setLikeCount((c) => c + (prev ? -1 : 1));
    try {
      if (prev) await api.unlikePost(post.id);
      else await api.likePost(post.id);
    } catch (err) {
      setLiked(prev);
      setLikeCount((c) => c + (prev ? 1 : -1));
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (e) => {
    e.stopPropagation();
    if (!confirm("Delete this thread?")) return;
    await api.deletePost(post.id);
    onChange?.();
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editValue.trim()) return;
    try {
      await api.editPost(post.id, editValue.trim());
      setEditing(false);
      onChange?.();
    } catch (err) {
      alert(err.message);
    }
  };

  const openThread = () => {
    if (!isDeleted) navigate(`/t/${post.id}`);
  };

  return (
    <article
      onClick={openThread}
      className="border-b border-zinc-800 px-4 py-3 hover:bg-zinc-900/40 cursor-pointer transition-colors"
    >
      <div className="flex gap-3">
        <div onClick={(e) => e.stopPropagation()}>
          <Link to={`/u/${post.author.username}`}>
            <Avatar user={post.author} />
          </Link>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 text-sm">
            <Link
              to={`/u/${post.author.username}`}
              onClick={(e) => e.stopPropagation()}
              className="font-semibold hover:underline truncate"
            >
              {post.author.display_name || post.author.username}
            </Link>
            <span className="text-zinc-500 truncate">@{post.author.username}</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500 text-xs">{timeAgo(post.created_at)}</span>
            {post.edited_at && (
              <span className="text-zinc-600 text-xs italic">(edited)</span>
            )}
          </div>

          {editing ? (
            <form onSubmit={saveEdit} onClick={(e) => e.stopPropagation()} className="mt-1">
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                maxLength={500}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-sm resize-none"
                rows={3}
                autoFocus
              />
              <div className="flex gap-2 mt-1">
                <button type="submit" className="text-xs px-3 py-1 rounded-full bg-white text-black font-semibold">Save</button>
                <button type="button" onClick={() => { setEditing(false); setEditValue(post.content); }} className="text-xs px-3 py-1 rounded-full border border-zinc-700">Cancel</button>
              </div>
            </form>
          ) : (
            <p className={`mt-1 whitespace-pre-wrap break-words text-[15px] ${isDeleted ? "italic text-zinc-500" : ""}`}>
              {post.content}
            </p>
          )}

          {!isDeleted && (
            <div className="flex items-center gap-4 mt-2 text-zinc-400 text-sm">
              <button
                onClick={toggleLike}
                disabled={busy}
                className="flex items-center gap-1 hover:text-pink-500 transition-colors"
              >
                <span className={liked ? "text-pink-500" : ""}>{liked ? "♥" : "♡"}</span>
                <span>{likeCount}</span>
              </button>
              <span className="flex items-center gap-1">
                <span>💬</span>
                <span>{post.reply_count}</span>
              </span>
              {isOwner && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditing(true); }}
                    className="ml-auto text-xs text-zinc-500 hover:text-white"
                  >
                    Edit
                  </button>
                  <button onClick={onDelete} className="text-xs text-zinc-500 hover:text-red-400">
                    Delete
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
