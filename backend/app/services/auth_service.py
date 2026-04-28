"""Challenge-response wallet auth.

Problem: the original MVP used `X-Wallet-Address: 0x...` as the PATCH auth
header. Wallet addresses are *public* (on-chain), so anyone who can read
the explorer can impersonate any owner. This module closes that hole.

Flow:
    1. POST /v1/auth/challenge { wallet_address }
       → server mints a nonce + message, stores (nonce → wallet), TTL 5m
    2. Owner signs the message in their browser via MetaMask personal_sign
       (EIP-191 — no gas, just a local signature)
    3. POST /v1/auth/verify { wallet_address, nonce, signature }
       → server recovers the signer from the signature, checks that:
         - the signature round-trips to the claimed wallet (ecrecover)
         - the nonce is valid, unexpired, and bound to that same wallet
       → server burns the nonce (one-shot) and mints an opaque bearer token
         (32 bytes base64url). Only a SHA-256 hash of the token is stored
         server-side — even a DB dump wouldn't leak live tokens.
    4. PATCH /v1/merchants/{id} Authorization: Bearer <token>
       → server resolves token → wallet → checks ownership → updates

Persistence model:
    - **Tokens** live in Supabase (`auth_tokens` table). They're long-lived
      (30 days) and consumed across many requests, so they MUST survive
      Vercel Fluid Compute multi-instance routing + cold starts. Keeping
      them in a per-process Python dict caused the symptom users were
      hitting: "agent keeps asking me to re-sign every few minutes" — the
      token was fine, the request just landed on a different instance.
    - **Challenges** stay in process memory (5-min TTL, used immediately
      after mint by the same client; the cross-instance probability in
      that 5-min window is small enough not to justify a DB round-trip).
      If we ever see complaints we'll move these too.

Attacker model:
    - Knows every wallet address on-chain → still can't mint a token
      because they can't sign the challenge without the private key.
    - Captures a token → can impersonate the wallet until TTL (30 days).
      Mitigation: short TTL + revocation endpoint (future).
    - Replays a nonce → nonce is burned on first successful verify; a
      replay gets 400.
    - Reads the auth_tokens table → only sees SHA-256 hashes; can't
      reconstruct the bearer token.
"""

import hashlib
import secrets
import threading
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi import HTTPException

from app.db.supabase_client import get_supabase_client

CHALLENGE_TTL_MINUTES = 5
TOKEN_TTL_DAYS = 30
TOKEN_TABLE = "auth_tokens"

# Process-local store for short-lived nonces only. Tokens are persisted
# to Supabase (see TOKEN_TABLE).
_challenges: Dict[str, Dict[str, Any]] = {}
_lock = threading.Lock()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _purge_expired_challenges() -> None:
    now = _now()
    for k in [k for k, v in _challenges.items() if v["expires_at"] < now]:
        _challenges.pop(k, None)


def create_challenge(wallet_address: str) -> Dict[str, Any]:
    """Mint a single-use nonce the owner must sign in their wallet."""
    wallet = wallet_address.lower()
    with _lock:
        _purge_expired_challenges()
        nonce = secrets.token_urlsafe(16)
        expires = _now() + timedelta(minutes=CHALLENGE_TTL_MINUTES)
        # Human-readable message so the user sees what they're signing in
        # MetaMask. EIP-191 personal_sign prepends its own preamble.
        message = (
            "TourSkill — authorize this agent session\n\n"
            f"Wallet: {wallet}\n"
            f"Nonce:  {nonce}\n"
            f"Expires: {expires.isoformat()}\n\n"
            "Signing is free (off-chain). It lets your agent manage the "
            "merchants owned by this wallet until the session expires."
        )
        _challenges[nonce] = {
            "wallet": wallet,
            "message": message,
            "expires_at": expires,
        }
        return {
            "nonce": nonce,
            "message": message,
            "expires_at": expires.isoformat(),
        }


def verify_and_mint(wallet_address: str, nonce: str, signature: str) -> Dict[str, Any]:
    """Verify the signed nonce and mint a bearer token on success."""
    wallet = wallet_address.lower()
    with _lock:
        _purge_expired_challenges()
        entry = _challenges.get(nonce)
        if not entry:
            raise HTTPException(status_code=400, detail="Invalid or expired nonce")
        if entry["wallet"] != wallet:
            # The caller tried to redeem a nonce issued for a different wallet.
            raise HTTPException(status_code=400, detail="Wallet does not match nonce")

        # EIP-191 recover
        try:
            encoded = encode_defunct(text=entry["message"])
            recovered = Account.recover_message(encoded, signature=signature)
        except Exception as e:  # noqa: BLE001 — surface malformed sig to client
            raise HTTPException(status_code=400, detail=f"Malformed signature: {e}") from e

        if recovered.lower() != wallet:
            # Signature is well-formed but was produced by a different key.
            raise HTTPException(status_code=403, detail="Signature does not recover to wallet")

        # Burn the nonce so it can't be replayed.
        _challenges.pop(nonce, None)

    # Mint + persist the token *outside* the in-memory lock — Supabase
    # round-trip would block other challenge ops unnecessarily.
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    expires = _now() + timedelta(days=TOKEN_TTL_DAYS)

    client = get_supabase_client()
    client.table(TOKEN_TABLE).insert(
        {
            "token_hash": token_hash,
            "wallet_address": wallet,
            "expires_at": expires.isoformat(),
        }
    ).execute()

    return {
        "token": token,
        "wallet_address": wallet,
        "expires_at": expires.isoformat(),
    }


def resolve_token(token: str) -> Optional[str]:
    """Return the wallet address a token authorizes, or None if invalid.

    Reads from Supabase so tokens minted on instance A still resolve on
    instance B. Treats expired rows as not-found (lazy expiry — a periodic
    cleanup job can sweep them later; for now they're harmless).
    """
    if not token:
        return None
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    client = get_supabase_client()
    res = (
        client.table(TOKEN_TABLE)
        .select("wallet_address,expires_at")
        .eq("token_hash", token_hash)
        .limit(1)
        .execute()
    )
    if not res.data:
        return None
    row = res.data[0]
    expires_at = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
    if expires_at < _now():
        # Lazy delete the expired row to keep the table tidy.
        client.table(TOKEN_TABLE).delete().eq("token_hash", token_hash).execute()
        return None
    return row["wallet_address"]


def revoke_token(token: str) -> bool:
    """Kill a token immediately. Returns True if something was revoked."""
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    client = get_supabase_client()
    res = (
        client.table(TOKEN_TABLE).delete().eq("token_hash", token_hash).execute()
    )
    return bool(res.data)
