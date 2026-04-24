"""End-to-end smoke test for the full onboard + auth pipeline.

What this proves:
  1. Agent can POST a draft and gets back a sign_url.
  2. Owner's browser challenge-response signs → mints an opaque bearer
     token. Replaying a consumed nonce is rejected.
  3. A signature from a DIFFERENT wallet cannot redeem another wallet's
     nonce (impersonation defense).
  4. Browser completes the draft with { merchant_id, wallet, tx_hash,
     auth_token } → status flips to signed and the token surfaces to
     the polling agent.
  5. Merchant row absorbs register_tx_hash.
  6. PATCH with the minted Bearer token succeeds.
  7. PATCH with ONLY the wallet address in the old X-Wallet-Address
     header is rejected (the public-wallet hole is closed).
  8. PATCH with a wrong bearer token is rejected.
  9. PATCH from a different wallet's token (same merchant) is rejected.
 10. Unknown draft id → 404.

What this does NOT prove (by design — no browser, no MetaMask):
  - The real on-chain MerchantRegistry.register() call. That step is
    exercised manually via the /merchant/sign/:draftId page.

Run:
  python -m scripts.e2e_draft_flow                         # hits localhost:8000
  BASE=https://api.tourskill.paking.xyz python -m scripts.e2e_draft_flow
"""

from __future__ import annotations

import os
import sys
import time
from typing import Any, Dict

import requests
from eth_account import Account
from eth_account.messages import encode_defunct

BASE = os.getenv("BASE", "http://127.0.0.1:8000").rstrip("/")
TIMEOUT = 15


def _step(msg: str) -> None:
    print(f"\n\x1b[36m→ {msg}\x1b[0m")


def _ok(msg: str) -> None:
    print(f"  \x1b[32m✓\x1b[0m {msg}")


def _fail(msg: str) -> None:
    print(f"  \x1b[31m✗ {msg}\x1b[0m")
    sys.exit(1)


def _expect(cond: bool, msg: str) -> None:
    if cond:
        _ok(msg)
    else:
        _fail(msg)


def _req(method: str, path: str, **kw: Any) -> requests.Response:
    r = requests.request(method, f"{BASE}{path}", timeout=TIMEOUT, **kw)
    return r


def mint_token(wallet_acct: Any) -> str:
    """Run the full challenge-response dance server-side, like the browser."""
    r = _req("POST", "/v1/auth/challenge", json={"wallet_address": wallet_acct.address})
    if r.status_code != 200:
        _fail(f"challenge failed: {r.status_code} {r.text}")
    c = r.json()
    encoded = encode_defunct(text=c["message"])
    sig_hex = Account.sign_message(encoded, private_key=wallet_acct.key).signature.hex()
    if not sig_hex.startswith("0x"):
        sig_hex = "0x" + sig_hex
    r = _req(
        "POST",
        "/v1/auth/verify",
        json={"wallet_address": wallet_acct.address, "nonce": c["nonce"], "signature": sig_hex},
    )
    if r.status_code != 200:
        _fail(f"verify failed: {r.status_code} {r.text}")
    return r.json()["token"]


def main() -> None:
    print(f"\x1b[1mE2E smoke — target: {BASE}\x1b[0m")

    # ─── Sanity: health ─────────────────────────────────────────────────
    _step("Health check")
    r = _req("GET", "/health")
    _expect(r.status_code == 200, f"GET /health → {r.status_code}")

    # ─── 1. Create a draft ──────────────────────────────────────────────
    _step("POST /v1/drafts — agent creates onboard draft")
    draft_body: Dict[str, Any] = {
        "merchant_type": "restaurant",
        "name": "E2E Smoke Cafe",
        "description": "Automated end-to-end smoke test. Safe to delete.",
        "city": "hangzhou",
        "country": "CN",
        "address": "1 Smoke Test Lane",
        "contact_phone": "+86 000 0000 0000",
        "contact_email": "smoke@example.com",
        "opening_hours": "00:00-24:00",
        "supported_skills": ["BookingBySkill"],
        "tags": ["e2e", "smoke"],
    }
    r = _req("POST", "/v1/drafts", json=draft_body)
    _expect(r.status_code == 200, f"draft create status = {r.status_code}")
    draft = r.json()
    draft_id: str = draft["draft_id"]
    _expect(bool(draft_id), f"draft_id returned: {draft_id}")

    # ─── 2. Challenge-response: mint a token ────────────────────────────
    _step("POST /v1/auth/challenge + sign + verify — mint session token")
    owner = Account.create()
    attacker = Account.create()
    _ok(f"owner wallet:    {owner.address}")
    _ok(f"attacker wallet: {attacker.address}")

    # Happy path
    r = _req("POST", "/v1/auth/challenge", json={"wallet_address": owner.address})
    _expect(r.status_code == 200, f"challenge status = {r.status_code}")
    challenge = r.json()

    encoded = encode_defunct(text=challenge["message"])
    owner_sig = Account.sign_message(encoded, private_key=owner.key).signature.hex()
    if not owner_sig.startswith("0x"):
        owner_sig = "0x" + owner_sig

    # Impersonation: attacker signs owner's nonce — server must recover a
    # different address and reject.
    attacker_sig = Account.sign_message(encoded, private_key=attacker.key).signature.hex()
    if not attacker_sig.startswith("0x"):
        attacker_sig = "0x" + attacker_sig

    _step("POST /v1/auth/verify — attacker cannot redeem owner's nonce")
    r = _req(
        "POST",
        "/v1/auth/verify",
        json={
            "wallet_address": owner.address,
            "nonce": challenge["nonce"],
            "signature": attacker_sig,
        },
    )
    _expect(r.status_code == 403, f"attacker verify status = {r.status_code}")

    _step("POST /v1/auth/verify — owner's signature succeeds")
    r = _req(
        "POST",
        "/v1/auth/verify",
        json={
            "wallet_address": owner.address,
            "nonce": challenge["nonce"],
            "signature": owner_sig,
        },
    )
    _expect(r.status_code == 200, f"owner verify status = {r.status_code}")
    owner_token = r.json()["token"]
    _expect(bool(owner_token), "token minted")

    _step("POST /v1/auth/verify — nonce replay must fail")
    r = _req(
        "POST",
        "/v1/auth/verify",
        json={
            "wallet_address": owner.address,
            "nonce": challenge["nonce"],
            "signature": owner_sig,
        },
    )
    _expect(r.status_code == 400, f"replay status = {r.status_code}")

    # ─── 3. Create merchant + complete draft with auth_token ────────────
    _step("POST /v1/merchants — simulate the browser's off-chain save")
    merchant_payload = {**draft_body, "wallet_address": owner.address}
    r = _req("POST", "/v1/merchants", json=merchant_payload)
    _expect(r.status_code == 200, f"merchant create status = {r.status_code}")
    merchant_id: str = r.json()["data"]["merchant_id"]
    _ok(f"created merchant_id = {merchant_id}")

    mock_tx = "0x" + "ab" * 32

    _step("POST /v1/drafts/{id}/complete — browser hands back {merchant, wallet, tx, token}")
    r = _req(
        "POST",
        f"/v1/drafts/{draft_id}/complete",
        json={
            "merchant_id": merchant_id,
            "wallet_address": owner.address,
            "tx_hash": mock_tx,
            "auth_token": owner_token,
        },
    )
    _expect(r.status_code == 200, f"complete status = {r.status_code}")
    d3 = r.json()
    _expect(d3["status"] == "signed", "status flipped → signed")
    _expect(d3["auth_token"] == owner_token, "auth_token surfaced to agent")

    # ─── 4. Agent polls — picks up token ────────────────────────────────
    _step("GET /v1/drafts/{id} — agent picks up token for future PATCH")
    time.sleep(0.2)
    r = _req("GET", f"/v1/drafts/{draft_id}")
    _expect(r.status_code == 200, f"re-read status = {r.status_code}")
    _expect(r.json()["auth_token"] == owner_token, "token durable across polls")

    # ─── 5. tx_hash landed on merchant row ──────────────────────────────
    _step("GET /v1/merchants/{id} — register_tx_hash written")
    r = _req("GET", f"/v1/merchants/{merchant_id}")
    _expect(r.json().get("register_tx_hash") == mock_tx, "register_tx_hash persisted")

    # ─── 6. PATCH with Bearer succeeds ──────────────────────────────────
    _step("PATCH /v1/merchants/{id} — pause with Bearer token")
    r = _req(
        "PATCH",
        f"/v1/merchants/{merchant_id}",
        json={"status": "inactive"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    _expect(r.status_code == 200, f"pause status = {r.status_code}")
    _expect(r.json()["data"]["status"] == "inactive", "status = inactive")

    # ─── 7. The OLD X-Wallet-Address hole is closed ─────────────────────
    _step("PATCH with X-Wallet-Address ONLY — must be rejected (old hole closed)")
    r = _req(
        "PATCH",
        f"/v1/merchants/{merchant_id}",
        json={"status": "active"},
        headers={"X-Wallet-Address": owner.address},
    )
    _expect(
        r.status_code in (401, 403),
        f"wallet-only patch status = {r.status_code} (expected 401/403)",
    )

    # ─── 8. Random bearer → 401 ─────────────────────────────────────────
    _step("PATCH with random bearer — must 401")
    r = _req(
        "PATCH",
        f"/v1/merchants/{merchant_id}",
        json={"status": "active"},
        headers={"Authorization": "Bearer randomfaketokenshouldnotwork"},
    )
    _expect(r.status_code == 401, f"random bearer status = {r.status_code}")

    # ─── 9. Attacker's OWN valid token on owner's merchant → 403 ────────
    _step("PATCH with attacker's legit token on owner's merchant — must 403")
    attacker_token = mint_token(attacker)
    r = _req(
        "PATCH",
        f"/v1/merchants/{merchant_id}",
        json={"status": "active"},
        headers={"Authorization": f"Bearer {attacker_token}"},
    )
    _expect(r.status_code == 403, f"attacker-token patch status = {r.status_code}")

    # ─── 10. Unknown draft → 404 ────────────────────────────────────────
    _step("GET /v1/drafts/does-not-exist → 404")
    r = _req("GET", "/v1/drafts/does-not-exist-xyz")
    _expect(r.status_code == 404, f"unknown draft status = {r.status_code}")

    # ─── Cleanup ────────────────────────────────────────────────────────
    _step("Cleanup — leave smoke merchant paused")
    r = _req(
        "PATCH",
        f"/v1/merchants/{merchant_id}",
        json={"status": "inactive"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    _expect(r.status_code == 200, f"pause status = {r.status_code}")

    print("\n\x1b[1;32m✓ E2E smoke passed — draft + challenge-response auth pipeline is healthy.\x1b[0m")
    print(f"  smoke merchant: {merchant_id} (paused, hidden from discover)")


if __name__ == "__main__":
    main()
