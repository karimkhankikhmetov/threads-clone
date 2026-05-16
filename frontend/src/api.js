// Base URL for the API. In dev, Vite proxies /api → backend.
// In production, set VITE_API_BASE to your backend URL.
const BASE = import.meta.env.VITE_API_BASE || "";

function getToken() {
  return localStorage.getItem("token");
}

export function setToken(t) {
  if (t) localStorage.setItem("token", t);
  else localStorage.removeItem("token");
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  const t = getToken();
  if (auth && t) headers.Authorization = `Bearer ${t}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!res.ok) {
    const msg = (data && data.detail) || (typeof data === "string" ? data : `HTTP ${res.status}`);
    const err = new Error(msg);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

export const api = {
  // auth
  signup: (p) => request("/api/auth/signup", { method: "POST", body: p, auth: false }),
  login: (p) => request("/api/auth/login", { method: "POST", body: p, auth: false }),
  me: () => request("/api/auth/me"),

  // users
  getProfile: (username) => request(`/api/users/${username}`),
  updateMe: (p) => request("/api/users/me", { method: "PATCH", body: p }),
  follow: (username) => request(`/api/users/${username}/follow`, { method: "POST" }),
  unfollow: (username) => request(`/api/users/${username}/follow`, { method: "DELETE" }),
  block: (username) => request(`/api/users/${username}/block`, { method: "POST" }),
  unblock: (username) => request(`/api/users/${username}/block`, { method: "DELETE" }),
  searchUsers: (q) => request(`/api/users/search/${encodeURIComponent(q)}`),

  // posts
  createPost: (p) => request("/api/posts", { method: "POST", body: p }),
  getPost: (id) => request(`/api/posts/${id}`),
  editPost: (id, content) => request(`/api/posts/${id}`, { method: "PATCH", body: { content } }),
  deletePost: (id) => request(`/api/posts/${id}`, { method: "DELETE" }),
  getReplies: (id, cursor) =>
    request(`/api/posts/${id}/replies${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
  likePost: (id) => request(`/api/posts/${id}/like`, { method: "POST" }),
  unlikePost: (id) => request(`/api/posts/${id}/like`, { method: "DELETE" }),

  // feed
  homeFeed: (cursor) =>
    request(`/api/feed/home${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
  exploreFeed: (cursor) =>
    request(`/api/feed/explore${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
  profileFeed: (username, cursor) =>
    request(`/api/feed/profile/${username}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
};
