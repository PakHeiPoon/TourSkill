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

Attacker model:
    - Knows every wallet address on-chain → still can't mint a token
      because they can't sign the challenge without the private key.
    - Captures a token → can impersonate the wallet until TTL (30 days).
      Mitigation: short TTL + revocation endpoint (future).
    - Replays a nonce → nonce is burned on first successful verify; a
      replay gets 400.
"""

import hashlib
import secrets
import threading
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi import HTTPException

CHALLENGE_TTL_MINUTES = 5
TOKEN_TTL_DAYS = 30

_challenges: Dict[str, Dict[str, Any]] = {}
_tokens: Dict[str, Dict[str, Any]] = {}
_lock = threading.Lock()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _purge_expired() -> None:
    now = _now()
    for k in [k for k, v in _challenges.items() if v["expires_at"] < now]:
        _challenges.pop(k, None)
    for k in [k for k, v in _tokens.items() if v["expires_at"] < now]:
        _tokens.pop(k, None)


def create_challenge(wallet_address: str) -> Dict[str, Any]:
    """Mint a single-use nonce the owner must sign in their wallet."""
    wallet = wallet_address.lower()
    with _lock:
        _purge_expired()
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
        _purge_expired()
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

        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        expires = _now() + timedelta(days=TOKEN_TTL_DAYS)
        _tokens[token_hash] = {"wallet": wallet, "expires_at": expires}

        return {
            "token": token,
            "wallet_address": wallet,
            "expires_at": expires.isoformat(),
        }


def resolve_token(token: str) -> Optional[str]:
    """Return the wallet address a token authorizes, or None if invalid."""
    if not token:
        return None
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    with _lock:
        _purge_expired()
        entry = _tokens.get(token_hash)
        if not entry:
            return None
        return entry["wallet"]


def revoke_token(token: str) -> bool:
    """Kill a token immediately. Returns True if something was revoked."""
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    with _lock:
        return _tokens.pop(token_hash, None) is not None
