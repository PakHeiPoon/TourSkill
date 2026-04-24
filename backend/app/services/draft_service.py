"""In-memory draft store for the "Sign Once" onboarding ceremony.

The merchant agent POSTs a draft payload, gets back a signed-URL, and
polls until the owner visits the URL in a browser, connects their wallet,
and completes the on-chain register call. Once signed, the agent reads
the resulting `wallet_address` and uses it as its auth header for all
subsequent PATCH calls (MVP auth — to be replaced by SIWE).

Persistence: in-process dict with a 1-hour TTL. Drafts are short-lived
bootstrap tokens, not a source of truth — losing them on restart just
means the owner has to re-request the sign URL. For a multi-instance
deployment we'd promote this to Supabase; MVP testnet is single-instance
on Vercel Fluid Compute so in-memory is adequate.
"""

import secrets
import threading
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from fastapi import HTTPException

from app.core.config import FRONTEND_BASE_URL
from app.schemas.draft import DraftCompleteRequest, DraftCreateRequest

DRAFT_TTL_MINUTES = 60

_drafts: Dict[str, Dict[str, Any]] = {}
_lock = threading.Lock()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _purge_expired() -> None:
    now = _now()
    stale = [k for k, v in _drafts.items() if v["expires_at"] < now]
    for k in stale:
        _drafts.pop(k, None)


def _public_view(draft_id: str) -> Dict[str, Any]:
    d = _drafts[draft_id]
    return {
        "draft_id": draft_id,
        "sign_url": f"{FRONTEND_BASE_URL.rstrip('/')}/merchant/sign/{draft_id}",
        "status": d["status"],
        "expires_at": d["expires_at"].isoformat(),
        "payload": d["payload"],
        "merchant_id": d["merchant_id"],
        "wallet_address": d["wallet_address"],
        "tx_hash": d["tx_hash"],
        "auth_token": d["auth_token"],
    }


def create_draft(req: DraftCreateRequest) -> Dict[str, Any]:
    with _lock:
        _purge_expired()
        # 16 bytes base64url → 22 chars, opaque to the caller.
        draft_id = secrets.token_urlsafe(16)
        now = _now()
        _drafts[draft_id] = {
            "payload": req.model_dump(),
            "status": "pending",
            "created_at": now,
            "expires_at": now + timedelta(minutes=DRAFT_TTL_MINUTES),
            "merchant_id": None,
            "wallet_address": None,
            "tx_hash": None,
            "auth_token": None,
        }
        return _public_view(draft_id)


def get_draft(draft_id: str) -> Dict[str, Any]:
    with _lock:
        _purge_expired()
        if draft_id not in _drafts:
            raise HTTPException(status_code=404, detail="Draft not found or expired")
        return _public_view(draft_id)


def complete_draft(draft_id: str, req: DraftCompleteRequest) -> Dict[str, Any]:
    with _lock:
        _purge_expired()
        if draft_id not in _drafts:
            raise HTTPException(status_code=404, detail="Draft not found or expired")
        draft = _drafts[draft_id]
        # Idempotent — the browser may refresh after completion. First
        # writer wins; subsequent calls just return the same view.
        if draft["status"] != "signed":
            draft["status"] = "signed"
            draft["merchant_id"] = req.merchant_id
            draft["wallet_address"] = req.wallet_address
            draft["tx_hash"] = req.tx_hash
            draft["auth_token"] = req.auth_token
        return _public_view(draft_id)
