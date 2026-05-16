import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth.jsx";
import ThreadCard from "../components/ThreadCard.jsx";
import ThreadComposer from "../components/ThreadComposer.jsx";

export default function ThreadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [post, setPost] = useState(null);
  const [replies, setReplies] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const p = await api.getPost(id);
      setPost(p);
      const r = await api.getReplies(id);
      setReplies(r.items);
      setCursor(r.next_cursor);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading && !post) return <p className="p-8 text-center text-zinc-500">Loading...</p>;
  if (err) return (
    <div className="p-8 text-center">
      <p className="text-zinc-400">{err}</p>
      <button onClick={() => navigate(-1)} className="mt-4 text-sm underline">Back</button>
    </div>
  );
  if (!post) return null;

  return (
    <div>
      <div className="sticky top-14 z-20 bg-black/70 backdrop-blur border-b border-zinc-800 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-xl">←</button>
        <h2 className="font-semibold">Thread</h2>
      </div>
      <ThreadCard post={post} onChange={load} />
      {user && post.status === "active" && (
        <ThreadComposer parentId={post.id} onPosted={load} placeholder={`Reply to @${post.author.username}...`} />
      )}
      {replies.map((r) => <ThreadCard key={r.id} post={r} onChange={load} />)}
      {cursor && (
        <button
          onClick={async () => {
            const r = await api.getReplies(id, cursor);
            setReplies((prev) => [...prev, ...r.items]);
            setCursor(r.next_cursor);
          }}
          className="block mx-auto my-4 text-sm text-zinc-400 hover:text-white"
        >
          Load more replies
        </button>
      )}
      {replies.length === 0 && post.status === "active" && (
        <p className="p-8 text-center text-zinc-500 text-sm">No replies yet.</p>
      )}
    </div>
  );
}
