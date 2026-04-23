"""Vercel serverless entrypoint. Re-exports the FastAPI app so Vercel's Python
runtime can serve it via ASGI. Local dev still runs `uvicorn app.main:app`."""
from app.main import app

__all__ = ["app"]
