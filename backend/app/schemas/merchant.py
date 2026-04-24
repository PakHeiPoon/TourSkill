from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

MerchantType = Literal["hotel", "restaurant", "attraction", "shop"]


class DiscoverRequest(BaseModel):
    city: Optional[str] = None
    type: Optional[MerchantType] = None
    keyword: Optional[str] = None
    wallet: Optional[str] = None  # 0x... — filter to merchants owned by this wallet
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
