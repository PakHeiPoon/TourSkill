from fastapi import APIRouter, HTTPException, Request

from app.constants.form_schema import FORM_SCHEMA
from app.schemas.merchant import DiscoverRequest, MerchantCreateRequest
from app.services.merchant_service import create_merchant, discover_merchants, fetch_merchant_by_id
from app.services.skill_service import execute_skill

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
