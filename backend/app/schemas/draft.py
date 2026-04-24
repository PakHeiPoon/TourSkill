from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from app.schemas.merchant import MerchantType


class DraftCreateRequest(BaseModel):
    """Payload the merchant agent wants the owner to sign + register on-chain.

    `wallet_address` is intentionally omitted — the owner's wallet is bound
    in the browser during the sign ceremony, not by the agent.
    """

    merchant_type: MerchantType
    name: str = Field(min_length=2)
    description: str = Field(min_length=5)
    city: str
    country: str = "CN"
    address: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    contact_phone: str
    contact_email: str
    opening_hours: str
    website_url: Optional[str] = None
    price_level: Optional[int] = Field(default=None, ge=1, le=5)
    tags: List[str] = Field(default_factory=list)
    languages_supported: List[str] = Field(default_factory=list)
    supported_skills: List[str] = Field(default_factory=list)
    specific_fields: Dict[str, Any] = Field(default_factory=dict)


class DraftCompleteRequest(BaseModel):
    """Browser reports back to backend after the signing ceremony finishes."""

    merchant_id: str
    wallet_address: str
    tx_hash: Optional[str] = None
    # Bearer token minted by POST /v1/auth/verify after the owner signed
    # the binding challenge in MetaMask. The browser attaches it here so
    # the polling agent can pick it up atomically with the merchant_id.
    auth_token: Optional[str] = None


class DraftView(BaseModel):
    """Public view of a draft — what both the browser and agent poll for."""

    draft_id: str
    sign_url: str
    status: str  # pending | signed | expired
    expires_at: str
    payload: Dict[str, Any]
    merchant_id: Optional[str] = None
    wallet_address: Optional[str] = None
    tx_hash: Optional[str] = None
    auth_token: Optional[str] = None
