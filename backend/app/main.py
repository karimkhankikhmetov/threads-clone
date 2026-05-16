import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import engine, Base
from .routers import auth_router, users, posts, feed

# Create tables on startup. (For a small project this is fine; for production
# you'd use Alembic migrations.)
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Threads Clone API", version="1.0.0")

# CORS — open by default for the demo. Tighten in production.
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(users.router)
app.include_router(posts.router)
app.include_router(feed.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
