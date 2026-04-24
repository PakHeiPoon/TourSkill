import uuid
from typing import Any, Dict

from fastapi import HTTPException

from app.db.supabase_client import get_supabase_client
from app.schemas.merchant import DiscoverRequest, MerchantCreateRequest, MerchantUpdateRequest
from app.services.hash_service import compute_profile_hash


def normalize_merchant(row: Dict[str, Any]) -> Dict[str, Any]:
    merchant_id = row["merchant_id"]
    specific = row.get("specific_fields") or {}
    return {
        "merchant_id": merchant_id,
        "did": row.get("did", f"did:tourskill:{merchant_id}"),
        "type": row.get("merchant_type"),
        "name": {"en": row.get("name_en", ""), "zh": row.get("name_zh", "")},
        "description": {"en": row.get("description_en", ""), "zh": row.get("description_zh", "")},
        "location": {
            "city": row.get("city", ""),
            "country": row.get("country", ""),
            "address": row.get("address", ""),
            "lat": row.get("latitude"),
            "lng": row.get("longitude"),
        },
        "contacts": {
            "phone": row.get("contact_phone"),
            "email": row.get("contact_email"),
            "website": row.get("website_url"),
        },
        "opening_hours": row.get("opening_hours"),
        "price_level": row.get("price_level"),
        "tags": row.get("tags") or [],
        "languages_supported": row.get("languages_supported") or [],
        "skills": row.get("supported_skills") or [],
        "specific_fields": specific,
        "wallet_address": row.get("wallet_address"),
        "profile_hash": row.get("profile_hash"),
        "profile_uri": row.get("profile_uri"),
        "skill_endpoint": row.get("skill_endpoint") or f"/v1/merchants/{merchant_id}",
        # Backfilled by scripts/backfill_tx_hash.py — surface the on-chain
        # MerchantRegistered tx so clients can deep-link to the explorer.
        "register_tx_hash": specific.get("register_tx_hash"),
        # active | inactive — owners pause/resume via PATCH /merchants/{id}.
        "status": row.get("status") or "active",
        "created_at": row.get("created_at"),
    }


def fetch_merchant_by_id(merchant_id: str) -> Dict[str, Any]:
    client = get_supabase_client()
    res = (
        client.table("merchants")
        .select("*")
        .eq("merchant_id", merchant_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Merchant not found")
    return normalize_merchant(res.data[0])


def update_merchant(
    merchant_id: str,
    payload: MerchantUpdateRequest,
    caller_wallet: str,
) -> Dict[str, Any]:
    """Partial update of a merchant's off-chain profile.

    Authorization (MVP): the caller's wallet (passed via X-Wallet-Address
    header, case-insensitive) must match the merchant's stored
    wallet_address. This is NOT a cryptographic proof and MUST be
    upgraded to SIWE-signed nonces before any mainnet migration.
    TODO(auth): replace with signed-nonce verification when SIWE ships.

    On-chain fields (wallet_address, profile_hash, register_tx_hash) are
    immutable through this endpoint by design — they anchor identity.
    """
    client = get_supabase_client()

    # Fetch current row for auth check
    res = (
        client.table("merchants")
        .select("wallet_address")
        .eq("merchant_id", merchant_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Merchant not found")

    owner = (res.data[0].get("wallet_address") or "").lower()
    if not caller_wallet or caller_wallet.lower() != owner:
        raise HTTPException(
            status_code=403,
            detail="Wallet does not own this merchant",
        )

    # Build the partial update dict — only include explicitly-set fields
    updates: Dict[str, Any] = payload.model_dump(exclude_unset=True)
    if not updates:
        # No-op update — just return current state
        return fetch_merchant_by_id(merchant_id)

    result = (
        client.table("merchants")
        .update(updates)
        .eq("merchant_id", merchant_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=500, detail="Update failed")
    return normalize_merchant(result.data[0])


def create_merchant(payload: MerchantCreateRequest) -> Dict[str, Any]:
    client = get_supabase_client()
    merchant_id = f"merchant:{uuid.uuid4().hex[:12]}"
    did = f"did:tourskill:{merchant_id}"
    profile_data = {
        "merchant_id": merchant_id,
        "did": did,
        "type": payload.merchant_type,
        "name": payload.name,
        "description": payload.description,
        "location": {
            "city": payload.city.lower(),
            "country": payload.country.upper(),
            "address": payload.address,
        },
        "skills": payload.supported_skills,
    }
    profile_hash = compute_profile_hash(profile_data)

    row = {
        "merchant_id": merchant_id,
        "did": did,
        "merchant_type": payload.merchant_type,
        "name_en": payload.name,
        "name_zh": payload.name,
        "description_en": payload.description,
        "description_zh": payload.description,
        "city": payload.city.lower(),
        "country": payload.country.upper(),
        "address": payload.address,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "contact_phone": payload.contact_phone,
        "contact_email": payload.contact_email,
        "opening_hours": payload.opening_hours,
        "website_url": payload.website_url,
        "price_level": payload.price_level,
        "tags": payload.tags,
        "languages_supported": payload.languages_supported,
        "supported_skills": payload.supported_skills,
        "specific_fields": payload.specific_fields,
        "wallet_address": payload.wallet_address,
        "profile_hash": profile_hash,
        "profile_uri": payload.profile_uri,
        "skill_endpoint": payload.skill_endpoint,
        "status": "active",
    }
    result = client.table("merchants").insert(row).execute()
    return normalize_merchant(result.data[0])


def discover_merchants(req: DiscoverRequest) -> Dict[str, Any]:
    client = get_supabase_client()
    query = (
        client.table("merchants")
        .select("*")
        .range(req.offset, req.offset + req.limit - 1)
    )
    # Default: hide paused merchants from consumers. Owners pass
    # include_inactive=True to see their own paused listings (for resume UX).
    if not req.include_inactive:
        query = query.eq("status", "active")
    if req.city:
        query = query.eq("city", req.city.lower())
    if req.type:
        query = query.eq("merchant_type", req.type)
    if req.keyword:
        kw = req.keyword.strip().replace("%", "")
        query = query.or_(f"name_en.ilike.%{kw}%,name_zh.ilike.%{kw}%")
    if req.wallet:
        # Wallet matching is case-insensitive (Ethereum addresses are EIP-55
        # mixed-case but should compare as hex-equal).
        query = query.ilike("wallet_address", req.wallet)

    result = query.order("created_at", desc=True).execute()
    merchants = [normalize_merchant(row) for row in result.data]
    return {"data": merchants, "total": len(merchants), "offset": req.offset, "limit": req.limit}
