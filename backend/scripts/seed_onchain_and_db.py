"""
Seed merchants on-chain (0G testnet MerchantRegistry) AND in Supabase, with the
same profile_hash anchored both places.

Source of truth for merchant data: seed_merchants.py (RESTAURANTS / HOTELS / ATTRACTIONS).

Usage:
    # Dry run — show what would happen, no tx, no DB write
    python scripts/seed_onchain_and_db.py --dry-run --limit 1

    # Single merchant — sign + insert one
    python scripts/seed_onchain_and_db.py --limit 1

    # Full run — wipe DB and re-seed all 29
    python scripts/seed_onchain_and_db.py --wipe

Required env (loaded from contracts/.env and backend/.env):
    DEPLOYER_PRIVATE_KEY  — wallet that signs register() calls
    REGISTRY_ADDRESS      — deployed MerchantRegistry contract
    SUPABASE_URL          — Supabase project URL
    SUPABASE_SERVICE_ROLE_KEY — service role key (bypasses RLS)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
import uuid
from pathlib import Path

# ── path setup ─────────────────────────────────────────────────────────
HERE = Path(__file__).resolve().parent
BACKEND = HERE.parent
PROJECT = BACKEND.parent
sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv
load_dotenv(BACKEND / ".env")
load_dotenv(PROJECT / "contracts" / ".env")

# Late imports so dotenv is loaded first
from app.db.supabase_client import get_supabase_client  # noqa: E402
from scripts.seed_merchants import RESTAURANTS, HOTELS, ATTRACTIONS  # noqa: E402

# ── chain config ───────────────────────────────────────────────────────
RPC_URL = os.getenv("ZEROG_RPC_URL", "https://evmrpc-testnet.0g.ai")
CHAIN_ID = int(os.getenv("ZEROG_CHAIN_ID", "16602"))
REGISTRY_ADDRESS = os.getenv("REGISTRY_ADDRESS")
PRIVATE_KEY = os.getenv("DEPLOYER_PRIVATE_KEY")
API_BASE = os.getenv("TOURSKILL_API_BASE", "http://localhost:8000")

ABI_PATH = (
    PROJECT
    / "contracts"
    / "artifacts"
    / "contracts"
    / "MerchantRegistry.sol"
    / "MerchantRegistry.json"
)


def load_contract_abi() -> list:
    with open(ABI_PATH) as fh:
        return json.load(fh)["abi"]


def merchant_id() -> str:
    return f"merchant:{uuid.uuid4().hex[:12]}"


def canonical_profile(m: dict, mtype: str, mid_str: str, did: str) -> dict:
    """Full canonical profile — this is what gets hashed."""
    return {
        "merchant_id": mid_str,
        "did": did,
        "type": mtype,
        "name": {"en": m["name"], "zh": m.get("name_zh", m["name"])},
        "description": m["desc"],
        "location": {
            "city": m["city"],
            "country": "CN",
            "address": m["address"],
            "latitude": m.get("lat"),
            "longitude": m.get("lng"),
        },
        "contact": {
            "phone": m["phone"],
            "email": m["email"],
            "website": m.get("website"),
        },
        "opening_hours": m["hours"],
        "price_level": m.get("price_level"),
        "tags": m.get("tags", []),
        "skills": m["skills"],
        "specific_fields": m.get("specific", {}),
        "schema_version": "0.1.0",
    }


def profile_hash(profile: dict) -> str:
    canonical = json.dumps(profile, sort_keys=True, ensure_ascii=False)
    return "0x" + hashlib.sha256(canonical.encode()).hexdigest()


def to_db_row(m: dict, mtype: str, mid_str: str, did: str, ph: str, profile_uri: str, skill_endpoint: str, wallet: str) -> dict:
    return {
        "merchant_id": mid_str,
        "did": did,
        "merchant_type": mtype,
        "name_en": m["name"],
        "name_zh": m.get("name_zh", m["name"]),
        "description_en": m["desc"],
        "description_zh": m["desc"],
        "city": m["city"],
        "country": "CN",
        "address": m["address"],
        "latitude": m.get("lat"),
        "longitude": m.get("lng"),
        "contact_phone": m["phone"],
        "contact_email": m["email"],
        "opening_hours": m["hours"],
        "website_url": m.get("website"),
        "price_level": m.get("price_level"),
        "tags": m.get("tags", []),
        "languages_supported": ["zh", "en"],
        "supported_skills": m["skills"],
        "specific_fields": m.get("specific", {}),
        "wallet_address": wallet,
        "profile_hash": ph,
        "profile_uri": profile_uri,
        "skill_endpoint": skill_endpoint,
        "status": "active",
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None, help="Only process first N merchants")
    ap.add_argument("--wipe", action="store_true", help="Delete all rows from merchants table first")
    ap.add_argument("--dry-run", action="store_true", help="Don't sign tx, don't write DB")
    ap.add_argument(
        "--skip-onchain",
        action="store_true",
        help="DB-only mode (compute hash but don't broadcast tx — for fast local iteration)",
    )
    args = ap.parse_args()

    # Validate env
    missing = [k for k, v in {
        "DEPLOYER_PRIVATE_KEY": PRIVATE_KEY,
        "REGISTRY_ADDRESS": REGISTRY_ADDRESS,
        "SUPABASE_URL": os.getenv("SUPABASE_URL"),
        "SUPABASE_SERVICE_ROLE_KEY": os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
    }.items() if not v]
    if missing and not args.dry_run:
        print(f"❌ Missing required env: {', '.join(missing)}")
        return 1

    # Build merchant queue
    queue: list[tuple[dict, str]] = []
    for r in RESTAURANTS:
        queue.append((r, "restaurant"))
    for h in HOTELS:
        queue.append((h, "hotel"))
    for a in ATTRACTIONS:
        queue.append((a, "attraction"))
    if args.limit:
        queue = queue[: args.limit]

    print(f"📋 Will process {len(queue)} merchants")
    print(f"   chain:    {RPC_URL} (chainId {CHAIN_ID})")
    print(f"   contract: {REGISTRY_ADDRESS}")
    print(f"   api_base: {API_BASE}")
    print(f"   mode:     {'DRY-RUN' if args.dry_run else ('SKIP-ONCHAIN' if args.skip_onchain else 'LIVE')}")
    print()

    # Set up web3 + signer (skip in dry-run)
    w3 = None
    contract = None
    wallet_addr = "0x0000000000000000000000000000000000000000"
    if not args.dry_run and not args.skip_onchain:
        from web3 import Web3
        w3 = Web3(Web3.HTTPProvider(RPC_URL))
        if not w3.is_connected():
            print(f"❌ Cannot connect to {RPC_URL}")
            return 1
        acct = w3.eth.account.from_key(PRIVATE_KEY)
        wallet_addr = acct.address
        balance = w3.eth.get_balance(wallet_addr)
        print(f"🔑 Signer:  {wallet_addr}")
        print(f"💰 Balance: {w3.from_wei(balance, 'ether')} 0G")
        if balance == 0:
            print("❌ Wallet has 0 balance. Get testnet tokens from https://hub.0g.ai/faucet?network=testnet")
            return 1
        contract = w3.eth.contract(address=Web3.to_checksum_address(REGISTRY_ADDRESS), abi=load_contract_abi())
        print()
    elif args.skip_onchain:
        # Use deployer address purely for the DB row
        try:
            from eth_account import Account
            wallet_addr = Account.from_key(PRIVATE_KEY).address
        except Exception:
            wallet_addr = "0x0000000000000000000000000000000000000000"

    # Wipe table
    db = None
    if not args.dry_run:
        db = get_supabase_client()
        if args.wipe:
            print("🗑  Wiping merchants table...")
            # Supabase delete requires a filter. neq on a guaranteed-present column.
            res = db.table("merchants").delete().neq("merchant_id", "__never__").execute()
            print(f"   Deleted {len(res.data) if res.data else '?'} rows\n")

    # Process queue
    successes = 0
    failures: list[tuple[str, str]] = []

    for i, (m, mtype) in enumerate(queue, 1):
        mid_str = merchant_id()
        did = f"did:tourskill:{mid_str}"
        profile = canonical_profile(m, mtype, mid_str, did)
        ph = profile_hash(profile)
        profile_uri = f"{API_BASE}/v1/merchants/{mid_str}/profile"
        skill_endpoint = f"{API_BASE}/v1/merchants/{mid_str}"

        print(f"[{i:2d}/{len(queue)}] {mtype:11s} | {m['name'][:40]:40s} | {mid_str}")

        # On-chain
        tx_hash = None
        if not args.dry_run and not args.skip_onchain:
            try:
                nonce = w3.eth.get_transaction_count(wallet_addr)
                tx = contract.functions.register(did, mtype, ph, profile_uri, skill_endpoint).build_transaction({
                    "from": wallet_addr,
                    "nonce": nonce,
                    "chainId": CHAIN_ID,
                    "gas": 1_000_000,
                    "gasPrice": w3.eth.gas_price,
                })
                signed = w3.eth.account.sign_transaction(tx, PRIVATE_KEY)
                raw = signed.raw_transaction if hasattr(signed, "raw_transaction") else signed.rawTransaction
                tx_hash = w3.eth.send_raw_transaction(raw).hex()
                print(f"          tx: {tx_hash}")
                receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
                if receipt.status != 1:
                    failures.append((mid_str, f"tx reverted: {tx_hash}"))
                    print(f"          ❌ tx reverted")
                    continue
                print(f"          ✅ block {receipt.blockNumber}, gas {receipt.gasUsed}")
            except Exception as e:
                failures.append((mid_str, f"on-chain error: {e}"))
                print(f"          ❌ {e}")
                continue

        # DB
        if not args.dry_run:
            row = to_db_row(m, mtype, mid_str, did, ph, profile_uri, skill_endpoint, wallet_addr)
            try:
                db.table("merchants").insert(row).execute()
                print(f"          ✅ DB row inserted")
            except Exception as e:
                failures.append((mid_str, f"DB error: {e}"))
                print(f"          ❌ DB insert failed: {e}")
                continue
        else:
            print(f"          [DRY] hash={ph[:16]}...")

        successes += 1
        # Tiny pause to avoid hammering RPC nonce
        if not args.dry_run and not args.skip_onchain:
            time.sleep(0.5)

    print()
    print("─" * 60)
    print(f"✅ Success: {successes}/{len(queue)}")
    if failures:
        print(f"❌ Failures: {len(failures)}")
        for mid_str, err in failures:
            print(f"   - {mid_str}: {err}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
