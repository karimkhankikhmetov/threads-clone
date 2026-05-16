import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

export default function Search() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q.trim()) { setItems([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await api.searchUsers(q.trim());
        setItems(r.items);
      } catch {} finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div>
      <div className="p-4 border-b border-zinc-800">
        <input
          value={q} onChange={(e) => setQ(e.target.value)} autoFocus
          placeholder="Search users..."
          className="w-full bg-zinc-900 border border-zinc-800 rounded-full px-5 py-2.5 outline-none focus:border-zinc-600"
        />
      </div>
      {loading && <p className="p-4 text-zinc-500 text-sm">Searching...</p>}
      {items.map((u) => (
        <Link
          to={`/u/${u.username}`} key={u.id}
          className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-900/40 border-b border-zinc-800"
        >
          <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center font-semibold">
            {(u.display_name || u.username)[0].toUpperCase()}
          </div>
          <div>
            <div className="font-semibold">{u.display_name || u.username}</div>
            <div className="text-sm text-zinc-500">@{u.username}</div>
          </div>
        </Link>
      ))}
      {!loading && q.trim() && items.length === 0 && (
        <p className="p-8 text-center text-zinc-500 text-sm">No users found.</p>
      )}
    </div>
  );
}
