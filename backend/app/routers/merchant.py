from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.constants.form_schema import FORM_SCHEMA
from app.schemas.merchant import DiscoverRequest, MerchantCreateRequest, MerchantUpdateRequest
from app.services.auth_service import resolve_token
from app.services.merchant_service import create_merchant, discover_merchants, fetch_merchant_by_id, update_merchant
from app.services.skill_service import execute_skill

bearer_scheme = HTTPBearer(auto_error=True, description="Bearer token minted via /v1/auth/verify")

router = APIRouter()


@router.get("/merchant-form-schema")
def get_merchant_form_schema():
    return FORM_SCHEMA


@router.post("/merchants")
def register_merchant(req: MerchantCreateRequest):
    merchant = create_merchant(req)
    return {"message": "Merchant registered successfully", "data": merchant}


@router.post("/discover")
def discover(req: DiscoverRequest):
    return discover_merchants(req)


@router.get("/merchants/{merchant_id}")
def get_merchant(merchant_id: str):
    return fetch_merchant_by_id(merchant_id)


@router.patch("/merchants/{merchant_id}")
def patch_merchant(
    merchant_id: str,
    payload: MerchantUpdateRequest,
    creds: HTTPAuthorizationCredentials = Depends(bearer_scheme),
):
    """Partial update of an existing merchant's off-chain profile.

    Auth: `Authorization: Bearer <token>` where the token was minted via
    the challenge-response flow in /v1/auth/verify. The bearer token
    resolves to a wallet address server-side; that wallet must own the
    merchant. Wallet addresses are public on-chain so they cannot be used
    as an auth secret — only a fresh signature proves ownership.
    """
    wallet = resolve_token(creds.credentials)
    if not wallet:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    merchant = update_merchant(merchant_id, payload, wallet)
    return {"message": "Merchant updated", "data": merchant}


@router.get("/merchants/{merchant_id}/skills")
def get_merchant_skills(merchant_id: str):
    merchant = fetch_merchant_by_id(merchant_id)
    return {"skills": merchant.get("skills", []), "endpoint": merchant.get("skill_endpoint")}


@router.post("/merchants/{merchant_id}/{skill_name}")
async def invoke_skill(merchant_id: str, skill_name: str, request: Request):
    merchant = fetch_merchant_by_id(merchant_id)
    if skill_name not in merchant.get("skills", []):
        raise HTTPException(status_code=400, detail=f"Skill {skill_name} not supported by merchant")
    payload = await request.json() if request.headers.get("content-type") == "application/json" else {}
    return execute_skill(skill_name, payload, merchant)
