from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

MerchantType = Literal["hotel", "restaurant", "attraction", "shop"]


class DiscoverRequest(BaseModel):
    city: Optional[str] = None
    type: Optional[MerchantType] = None
    keyword: Optional[str] = None
    wallet: Optional[str] = None  # 0x... — filter to merchants owned by this wallet
    # By default we only return active merchants. Owners who want to see
    # their paused listings (to resume them) set this to True.
    include_inactive: bool = False
    limit: int = 30
    offset: int = 0


class MerchantCreateRequest(BaseModel):
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
    wallet_address: str
    profile_hash: Optional[str] = None
    profile_uri: Optional[str] = None
    skill_endpoint: Optional[str] = None


MerchantStatus = Literal["active", "inactive"]


class MerchantUpdateRequest(BaseModel):
    """Partial update — only fields present in the body are applied.

    On-chain fields (wallet_address, profile_hash, register_tx_hash) are NOT
    mutable through this endpoint by design — they're immutable identity
    anchors. To change wallet ownership, use the dedicated /transfer flow
    (roadmap).
    """

    # identity-ish
    name_en: Optional[str] = None
    name_zh: Optional[str] = None
    description_en: Optional[str] = None
    description_zh: Optional[str] = None

    # location
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    # contact
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    website_url: Optional[str] = None
    opening_hours: Optional[str] = None

    # classification
    price_level: Optional[int] = Field(default=None, ge=1, le=5)
    tags: Optional[List[str]] = None
    languages_supported: Optional[List[str]] = None

    # ops
    supported_skills: Optional[List[str]] = None
    specific_fields: Optional[Dict[str, Any]] = None
    status: Optional[MerchantStatus] = None  # active / inactive (pause/resume)
