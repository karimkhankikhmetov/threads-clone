import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: "", username: "", password: "", display_name: "",
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await signup(form);
      navigate("/");
    } catch (e) {
      setErr(e.message || "Signup failed");
    } finally {
      setBusy(false);
    }
  };

  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold mb-6 text-center">threads</h1>
        <form onSubmit={submit} className="space-y-3">
          <input
            type="email" required value={form.email} onChange={upd("email")}
            placeholder="email"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-zinc-600"
          />
          <input
            required value={form.username} onChange={upd("username")}
            placeholder="username (a-z, 0-9, _)" minLength={3} maxLength={30}
            pattern="^[a-zA-Z0-9_]+$"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-zinc-600"
          />
          <input
            value={form.display_name} onChange={upd("display_name")}
            placeholder="display name (optional)" maxLength={100}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-zinc-600"
          />
          <input
            type="password" required value={form.password} onChange={upd("password")}
            placeholder="password (min 6 chars)" minLength={6}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-zinc-600"
          />
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <button
            type="submit" disabled={busy}
            className="w-full bg-white text-black py-3 rounded-xl font-semibold disabled:opacity-50"
          >
            {busy ? "..." : "Sign up"}
          </button>
        </form>
        <p className="text-center text-zinc-500 text-sm mt-4">
          Have an account? <Link to="/login" className="text-white underline">Log in</Link>
        </p>
      </div>
    </div>
  );
}
