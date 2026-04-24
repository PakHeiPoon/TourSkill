from pydantic import BaseModel, Field


class ChallengeRequest(BaseModel):
    wallet_address: str = Field(..., min_length=42, max_length=42, pattern=r"^0x[0-9a-fA-F]{40}$")


class ChallengeResponse(BaseModel):
    nonce: str
    message: str
    expires_at: str


class VerifyRequest(BaseModel):
    wallet_address: str = Field(..., min_length=42, max_length=42, pattern=r"^0x[0-9a-fA-F]{40}$")
    nonce: str
    signature: str = Field(..., min_length=132, max_length=132, pattern=r"^0x[0-9a-fA-F]{130}$")


class TokenResponse(BaseModel):
    token: str
    wallet_address: str
    expires_at: str
