import { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import { useAuth } from "../auth.jsx";
import ThreadCard from "../components/ThreadCard.jsx";
import ThreadComposer from "../components/ThreadComposer.jsx";

export default function Feed({ mode = "home" }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [tab, setTab] = useState(mode);

  const fetcher = useCallback(async (resetCursor = null) => {
    setLoading(true);
    try {
      const data = tab === "home" && user
        ? await api.homeFeed(resetCursor)
        : await api.exploreFeed(resetCursor);
      setItems((prev) => (resetCursor ? [...prev, ...data.items] : data.items));
      setCursor(data.next_cursor);
      setHasMore(!!data.next_cursor);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [tab, user]);

  useEffect(() => { fetcher(null); }, [fetcher]);

  const refresh = () => fetcher(null);

  return (
    <div>
      {/* tabs */}
      <div className="sticky top-14 z-20 bg-black/70 backdrop-blur border-b border-zinc-800 flex">
        {user && (
          <button
            onClick={() => setTab("home")}
            className={`flex-1 py-3 text-sm font-medium relative ${tab === "home" ? "text-white" : "text-zinc-500"}`}
          >
            For you
            {tab === "home" && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-white"/>}
          </button>
        )}
        <button
          onClick={() => setTab("explore")}
          className={`flex-1 py-3 text-sm font-medium relative ${tab === "explore" ? "text-white" : "text-zinc-500"}`}
        >
          Explore
          {tab === "explore" && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-white"/>}
        </button>
      </div>

      {user && tab === "home" && <ThreadComposer onPosted={refresh} />}

      {items.length === 0 && !loading && (
        <div className="p-12 text-center text-zinc-500">
          {tab === "home" && user
            ? "Your feed is empty. Follow some people or check Explore."
            : "Nothing here yet. Be the first to post."}
        </div>
      )}

      {items.map((p) => (
        <ThreadCard key={p.id} post={p} onChange={refresh} />
      ))}

      {hasMore && !loading && (
        <button
          onClick={() => fetcher(cursor)}
          className="block mx-auto my-4 text-sm text-zinc-400 hover:text-white"
        >
          Load more
        </button>
      )}
      {loading && <p className="text-center text-zinc-500 py-6 text-sm">Loading...</p>}
    </div>
  );
}
