import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth.jsx";
import ThreadCard from "../components/ThreadCard.jsx";

export default function Profile() {
  const { username } = useParams();
  const { user: me, setUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({});

  const load = useCallback(async () => {
    setErr(null);
    try {
      const p = await api.getProfile(username);
      setProfile(p);
      setForm({ display_name: p.display_name, bio: p.bio, avatar_url: p.avatar_url, is_private: p.is_private });
      const f = await api.profileFeed(username);
      setItems(f.items);
      setCursor(f.next_cursor);
    } catch (e) {
      setErr(e.message);
    }
  }, [username]);

  useEffect(() => { load(); }, [load]);

  if (err) return <p className="p-8 text-center text-zinc-500">{err}</p>;
  if (!profile) return <p className="p-8 text-center text-zinc-500">Loading...</p>;

  const isMe = me && me.id === profile.id;

  const toggleFollow = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (profile.follow_status) await api.unfollow(username);
      else await api.follow(username);
      await load();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleBlock = async () => {
    if (busy) return;
    if (!confirm(profile.is_blocked ? "Unblock this user?" : "Block this user? They won't be able to see your posts or interact with you.")) return;
    setBusy(true);
    try {
      if (profile.is_blocked) await api.unblock(username);
      else await api.block(username);
      await load();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async () => {
    setBusy(true);
    try {
      const updated = await api.updateMe(form);
      setUser(updated);
      setEditMode(false);
      await load();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  const followBtnText = () => {
    if (profile.follow_status === "pending") return "Requested";
    if (profile.follow_status === "accepted") return "Following";
    return "Follow";
  };

  return (
    <div>
      <div className="p-5 border-b border-zinc-800">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h2 className="text-2xl font-bold">{profile.display_name || profile.username}</h2>
            <p className="text-zinc-400">@{profile.username} {profile.is_private && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-zinc-800">Private</span>}</p>
          </div>
          <div className="w-16 h-16 rounded-full bg-zinc-700 flex items-center justify-center text-2xl font-semibold">
            {profile.avatar_url
              ? <img src={profile.avatar_url} className="w-16 h-16 rounded-full object-cover" alt="" />
              : (profile.display_name || profile.username)[0].toUpperCase()}
          </div>
        </div>
        {profile.bio && <p className="text-[15px] whitespace-pre-wrap mb-3">{profile.bio}</p>}
        <div className="text-sm text-zinc-400 mb-3">
          <span className="text-white font-semibold">{profile.follower_count}</span> followers ·{" "}
          <span className="text-white font-semibold">{profile.following_count}</span> following ·{" "}
          <span className="text-white font-semibold">{profile.post_count}</span> threads
        </div>

        {isMe ? (
          <button
            onClick={() => setEditMode(!editMode)}
            className="w-full py-2 rounded-lg border border-zinc-700 text-sm font-semibold hover:bg-zinc-900"
          >
            {editMode ? "Cancel" : "Edit profile"}
          </button>
        ) : me && (
          <div className="flex gap-2">
            <button
              onClick={toggleFollow}
              disabled={busy || profile.is_blocking}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 ${
                profile.follow_status ? "border border-zinc-700" : "bg-white text-black"
              }`}
            >
              {profile.is_blocking ? "Unavailable" : followBtnText()}
            </button>
            <button
              onClick={toggleBlock}
              disabled={busy}
              className="px-4 py-2 rounded-lg border border-zinc-700 text-sm font-semibold hover:bg-zinc-900"
            >
              {profile.is_blocked ? "Unblock" : "Block"}
            </button>
          </div>
        )}

        {editMode && isMe && (
          <div className="mt-4 space-y-2">
            <input
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              placeholder="Display name"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-sm"
            />
            <textarea
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              placeholder="Bio" maxLength={500} rows={3}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-sm resize-none"
            />
            <input
              value={form.avatar_url}
              onChange={(e) => setForm({ ...form, avatar_url: e.target.value })}
              placeholder="Avatar URL"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-sm"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!form.is_private}
                onChange={(e) => setForm({ ...form, is_private: e.target.checked })}
              />
              Private account (requires approval to follow)
            </label>
            <button
              onClick={saveProfile} disabled={busy}
              className="w-full py-2 rounded-lg bg-white text-black font-semibold disabled:opacity-50"
            >
              Save
            </button>
          </div>
        )}
      </div>

      {profile.is_private && !profile.is_following && !isMe ? (
        <p className="p-8 text-center text-zinc-500 text-sm">This account is private. Follow to see their threads.</p>
      ) : items.length === 0 ? (
        <p className="p-8 text-center text-zinc-500 text-sm">No threads yet.</p>
      ) : (
        items.map((p) => <ThreadCard key={p.id} post={p} onChange={load} />)
      )}
    </div>
  );
}
