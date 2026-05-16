import { useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth.jsx";

// Generate a client-side idempotency key. Each compose session gets a new key
// that's regenerated only after a successful submit, so double-clicks reuse it.
function genKey() {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  );
}

export default function ThreadComposer({ parentId = null, onPosted, placeholder = "Start a thread..." }) {
  const { user } = useAuth();
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const idempotencyKey = useRef(genKey());

  if (!user) return null;

  const submit = async (e) => {
    e.preventDefault();
    const text = content.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const post = await api.createPost({
        content: text,
        parent_id: parentId,
        idempotency_key: idempotencyKey.current,
      });
      setContent("");
      idempotencyKey.current = genKey(); // new session
      onPosted?.(post);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="border-b border-zinc-800 p-4"
    >
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center font-semibold flex-shrink-0">
          {(user.display_name || user.username)[0]?.toUpperCase()}
        </div>
        <div className="flex-1">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={placeholder}
            maxLength={500}
            rows={parentId ? 2 : 3}
            className="w-full bg-transparent resize-none outline-none text-[15px] placeholder:text-zinc-500"
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-zinc-500">{content.length}/500</span>
            <button
              type="submit"
              disabled={busy || !content.trim()}
              className="px-4 py-1.5 rounded-full bg-white text-black text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? "Posting..." : parentId ? "Reply" : "Post"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
