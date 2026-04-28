"""Supabase-backed draft store for the "Sign Once" onboarding ceremony.

The merchant agent POSTs a draft payload, gets back a signed-URL, and
polls until the owner visits the URL in a browser, connects their wallet,
and completes the on-chain register call. Once signed, the agent reads
the resulting `wallet_address` + `auth_token` and uses the bearer token
for all subsequent PATCH calls.

Persistence: Supabase `merchant_drafts` table. Drafts used to live in a
process-local Python dict, which broke as soon as Vercel Fluid Compute
routed the polling agent to a different instance than the one that
created the draft (or after the original instance was recycled). Same
fix applied here as for auth_tokens — single source of truth in
Supabase, all readers see the same state.
"""

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from fastapi import HTTPException

from app.core.config import FRONTEND_BASE_URL
from app.db.supabase_client import get_supabase_client
from app.schemas.draft import DraftCompleteRequest, DraftCreateRequest

DRAFT_TTL_MINUTES = 60
DRAFT_TABLE = "merchant_drafts"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _row_to_view(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "draft_id": row["draft_id"],
        "sign_url": f"{FRONTEND_BASE_URL.rstrip('/')}/merchant/sign/{row['draft_id']}",
        "status": row["status"],
        "expires_at": row["expires_at"],
        "payload": row["payload"],
        "merchant_id": row.get("merchant_id"),
        "wallet_address": row.get("wallet_address"),
        "tx_hash": row.get("tx_hash"),
        "auth_token": row.get("auth_token"),
    }


def create_draft(req: DraftCreateRequest) -> Dict[str, Any]:
    # 16 bytes base64url → 22 chars, opaque to the caller.
    draft_id = secrets.token_urlsafe(16)
    expires_at = _now() + timedelta(minutes=DRAFT_TTL_MINUTES)
    row = {
        "draft_id": draft_id,
        "payload": req.model_dump(),
        "status": "pending",
        "expires_at": expires_at.isoformat(),
        "merchant_id": None,
        "wallet_address": None,
        "tx_hash": None,
        "auth_token": None,
    }
    client = get_supabase_client()
    res = client.table(DRAFT_TABLE).insert(row).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create draft")
    return _row_to_view(res.data[0])


def get_draft(draft_id: str) -> Dict[str, Any]:
    client = get_supabase_client()
    res = (
        client.table(DRAFT_TABLE)
        .select("*")
        .eq("draft_id", draft_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Draft not found or expired")
    row = res.data[0]
    expires_at = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
    if expires_at < _now():
        # Lazy delete the expired row.
        client.table(DRAFT_TABLE).delete().eq("draft_id", draft_id).execute()
        raise HTTPException(status_code=404, detail="Draft not found or expired")
    return _row_to_view(row)


def complete_draft(draft_id: str, req: DraftCompleteRequest) -> Dict[str, Any]:
    client = get_supabase_client()
    res = (
        client.table(DRAFT_TABLE)
        .select("*")
        .eq("draft_id", draft_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Draft not found or expired")
    current = res.data[0]
    expires_at = datetime.fromisoformat(current["expires_at"].replace("Z", "+00:00"))
    if expires_at < _now():
        client.table(DRAFT_TABLE).delete().eq("draft_id", draft_id).execute()
        raise HTTPException(status_code=404, detail="Draft not found or expired")

    # Idempotent — the browser may refresh after completion. First writer
    # wins; subsequent calls just return the same view.
    if current["status"] == "signed":
        return _row_to_view(current)

    update = {
        "status": "signed",
        "merchant_id": req.merchant_id,
        "wallet_address": req.wallet_address,
        "tx_hash": req.tx_hash,
        "auth_token": req.auth_token,
    }
    upd = (
        client.table(DRAFT_TABLE)
        .update(update)
        .eq("draft_id", draft_id)
        .execute()
    )
    if not upd.data:
        raise HTTPException(status_code=500, detail="Failed to mark draft signed")
    return _row_to_view(upd.data[0])
