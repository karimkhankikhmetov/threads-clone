# Threads Clone

A minimal-but-complete clone of Meta's Threads built for INF 114 Final Project.
Threads-style UI, FastAPI backend, React frontend, fully containerized.

**Tech stack:** FastAPI · SQLAlchemy · SQLite · JWT · React 18 · Vite · Tailwind CSS · Docker · nginx

---

## Features

- **Auth** — signup, login, JWT-based session (7-day expiry)
- **Profiles** — display name, bio, avatar URL, public/private toggle
- **Threads (posts)** — create, edit (with history), soft-delete
- **Replies** — nested under any thread
- **Likes** — idempotent, with real-time counts
- **Follows** — accepted/pending status for private accounts
- **Blocks** — both directions, removes follow relationships
- **Feeds** — Home (people you follow + yourself), Explore (all public)
- **User search** — debounced search by username or display name
- **Keyset pagination** — survives anchor-post deletion

---

## Edge cases handled

These are the production-grade edge cases covered in code. Search the codebase
for `EDGE CASE:` to see each one in context — useful for the Q&A.

### Users & accounts
- **Case-insensitive email uniqueness.** `Test@Gmail.com` and `test@gmail.com` are treated as the same email. Stored lowercase only. (`auth_router.py`)
- **Race-safe signup.** No pre-check + insert pattern. We attempt the INSERT and catch `IntegrityError` → 409. (`auth_router.py`)
- **Deactivated account login rejected.** Even with a valid JWT, deleted/deactivated users are rejected on every request, not just login. (`auth.py:get_current_user`)
- **Generic auth errors.** Login failure says "Invalid credentials" — never reveals whether the email exists.

### Posts
- **Idempotent post creation (double-tap protection).** Client sends an `idempotency_key`; duplicate POSTs return the original post, never a duplicate row. Unique constraint enforces this at the DB level. (`posts.py:create_post`)
- **Soft delete.** Deleted posts keep their row with `status='deleted'` and show `[Post deleted]` placeholder. Reply structure is preserved. (`posts.py:delete_post`)
- **Edit history is stored.** Every edit appends `{content, edited_at}` to `edit_history` JSON. We never silently overwrite. (`posts.py:edit_post`)
- **Block-aware reads.** Every post fetch checks for blocks in both directions and returns 404 if blocked (not 403 — don't confirm the post exists). (`posts.py:get_post`)
- **Private account read protection.** Only followers can read posts from private accounts. (`helpers.py:can_view_user_content`)

### Likes
- **Double-like race condition.** Unique constraint on `(user_id, post_id)`. Concurrent likes resolve to one row. We catch `IntegrityError` and return 200. (`posts.py:like_post`)
- **Unlike of never-liked post.** Idempotent 200 — never 404. (`posts.py:unlike_post`)
- **Like from blocked user.** Block check inside the same transaction as the insert. (`posts.py:like_post`)

### Follows
- **Cannot follow yourself.** Returns 422 with explicit message. (`users.py:follow`)
- **Cannot follow someone who blocked you.** Returns 404, never 403 — don't reveal the block. (`users.py:follow`)
- **Idempotent unfollow.** Unfollowing a deleted account or someone you don't follow returns 200. (`users.py:unfollow`)
- **Race-safe follow.** Catches `IntegrityError` on the unique `(follower_id, following_id)` constraint. (`users.py:follow`)
- **No cached follower_count.** Counts are computed via `COUNT(*)` at read time. Avoids write contention on viral accounts. (`users.py:_profile_payload`)

### Blocks & privacy
- **Block removes both directions of follow.** Permanent — unblock does NOT restore. (`users.py:block`)
- **Block auto-rejects pending follow requests.** Pending follows are deleted alongside the block. (`users.py:block`)
- **Idempotent unblock.** Returns 200 whether or not the block existed. (`users.py:unblock`)
- **Privacy change: private → public.** All pending follow requests auto-accept. (`users.py:update_me`)
- **Privacy change: public → private.** Existing accepted followers keep access; future follow requests require approval.

### Feed
- **Real-time block filtering.** Feed always applies a live block filter; never serves stale cached content from blocked users. (`feed.py`)
- **Keyset pagination on `(created_at, id)`.** Mathematically valid even when the anchor post is deleted — we don't need the anchor to exist. (`feed.py:_apply_cursor`)
- **Explore filters out private accounts and blocked users.** No content leakage into discovery. (`feed.py:explore_feed`)

---

## Running locally with Docker

The only prerequisite is **Docker** with Compose v2 installed.

```bash
# 1. Copy env template and set a real secret
cp .env.example .env
# Edit .env — at minimum, replace SECRET_KEY with a long random string:
#   SECRET_KEY=$(openssl rand -hex 32)

# 2. Build and start
docker compose up --build -d

# 3. Open in browser
# http://localhost
```

The SQLite database lives in a named Docker volume (`threads_data`) so it
survives container restarts. To wipe everything and start fresh:

```bash
docker compose down -v
```

To watch logs:
```bash
docker compose logs -f
```

### API documentation

When running, FastAPI's auto-generated Swagger UI is available at
`http://localhost/api/docs` (via nginx proxy) or directly at
`http://localhost:8000/docs` if you uncomment the `ports` line for the backend
service in `docker-compose.yml`.

---

## Running locally without Docker (dev mode with hot reload)

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate         # Windows: .venv\Scripts\activate
pip install -r requirements.txt
mkdir -p /tmp/data
DATABASE_URL="sqlite:////tmp/data/threads.db" \
  uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# Open http://localhost:5173
```

The Vite dev server proxies `/api/*` to `http://localhost:8000` automatically.

---

## Deployment to a VPS via Dockploy

Dockploy is a self-hosted alternative to Vercel/Heroku that runs Docker
Compose stacks on your own server. Here's the deployment flow.

### 1. Prepare the VPS

Any cheap VPS works (Hetzner, DigitalOcean, Vultr, etc.). Minimum spec:
**1 vCPU, 1 GB RAM, 20 GB disk**, running Ubuntu 22.04 or newer.

SSH in and install Dockploy:
```bash
curl -sSL https://dokploy.com/install.sh | sh
```
After it finishes, Dockploy's dashboard runs at `http://<your-vps-ip>:3000`.
Create your admin account there.

### 2. Push your code to GitHub

```bash
git init
git add .
git commit -m "Threads clone"
git remote add origin https://github.com/<you>/threads-clone.git
git push -u origin main
```

### 3. Create the project in Dockploy

In the Dockploy dashboard:

1. **Projects → Create Project** — name it `threads`.
2. Inside the project, **Create Service → Compose**.
3. **Source:** point at your GitHub repo (Dockploy will prompt to authorize).
4. **Compose file path:** `docker-compose.yml` (the default).
5. **Environment variables** — add:
   - `SECRET_KEY` = `<long random string>` (run `openssl rand -hex 32` locally)
   - `ALLOWED_ORIGINS` = `https://your-domain.com` (or `*` for the demo)
6. **Domains** — point a subdomain at your VPS IP via DNS A record, then add
   the domain in Dockploy on the `frontend` service. Dockploy will auto-issue
   a Let's Encrypt cert via Traefik. Map port `80` of the `frontend` service.
7. **Deploy.**

Dockploy will clone the repo, run `docker compose build`, and start the
stack. Subsequent pushes to `main` can be auto-deployed by enabling the
webhook.

### 4. Verify

- `https://your-domain.com` — should show the Threads UI
- `https://your-domain.com/api/health` — should return `{"status":"ok"}`
- `https://your-domain.com/api/docs` — interactive API explorer

### Troubleshooting

- **Port 80 conflict:** if Dockploy's Traefik already binds port 80, do **not**
  publish `80:80` in `docker-compose.yml`. Instead remove the `ports:` block
  on `frontend` and let Dockploy's Traefik route the domain → frontend
  container's port 80.
- **CORS errors in browser:** set `ALLOWED_ORIGINS` to your exact frontend
  domain (no trailing slash).
- **Database lost on redeploy:** make sure the `threads_data` volume in
  `docker-compose.yml` is a **named** volume (it is — `threads_data:` at the
  bottom), not an anonymous one.

---

## Project structure

```
threads-clone/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI entrypoint
│   │   ├── database.py        # SQLAlchemy engine + session
│   │   ├── models.py          # User, Post, Like, Follow, Block tables
│   │   ├── schemas.py         # Pydantic request/response shapes
│   │   ├── auth.py            # JWT, password hashing, current-user dep
│   │   ├── helpers.py         # Block-awareness helpers
│   │   └── routers/
│   │       ├── auth_router.py # POST signup, POST login, GET me
│   │       ├── users.py       # profile, follow, block, search
│   │       ├── posts.py       # CRUD threads + replies + likes
│   │       └── feed.py        # home, explore, profile feeds
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── main.jsx           # React mount
│   │   ├── App.jsx            # Router
│   │   ├── api.js             # Fetch wrapper
│   │   ├── auth.jsx           # AuthProvider context
│   │   ├── components/
│   │   │   ├── Layout.jsx     # Top nav
│   │   │   ├── ThreadCard.jsx # Single post UI
│   │   │   └── ThreadComposer.jsx
│   │   └── pages/
│   │       ├── Login.jsx / Signup.jsx
│   │       ├── Feed.jsx       # Home + Explore tabs
│   │       ├── ThreadDetail.jsx
│   │       ├── Profile.jsx
│   │       └── Search.jsx
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js         # /api proxy in dev
│   ├── tailwind.config.js
│   ├── nginx.conf             # /api proxy in prod
│   └── Dockerfile             # multi-stage: node build → nginx
├── docker-compose.yml         # backend + frontend + volume
├── .env.example
└── README.md
```

---

## API reference (quick)

```
POST   /api/auth/signup        { email, username, password, display_name? }
POST   /api/auth/login         { email, password }
GET    /api/auth/me            (auth) → User

GET    /api/users/{username}
PATCH  /api/users/me           { display_name?, bio?, avatar_url?, is_private? }
POST   /api/users/{u}/follow
DELETE /api/users/{u}/follow
POST   /api/users/{u}/block
DELETE /api/users/{u}/block
GET    /api/users/search/{q}

POST   /api/posts              { content, parent_id?, idempotency_key? }
GET    /api/posts/{id}
PATCH  /api/posts/{id}         { content }
DELETE /api/posts/{id}
GET    /api/posts/{id}/replies?cursor=...
POST   /api/posts/{id}/like
DELETE /api/posts/{id}/like

GET    /api/feed/home?cursor=...
GET    /api/feed/explore?cursor=...
GET    /api/feed/profile/{username}?cursor=...
```

---

## License

This project is for educational purposes (SDU University INF 114 final project, May 2026).
