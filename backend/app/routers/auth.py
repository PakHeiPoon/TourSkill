"""Wallet challenge-response auth endpoints."""

from fastapi import APIRouter

from app.schemas.auth import ChallengeRequest, VerifyRequest
from app.services.auth_service import create_challenge, verify_and_mint

router = APIRouter()


@router.post("/auth/challenge")
def post_challenge(req: ChallengeRequest):
    """Mint a single-use nonce the owner signs with their wallet."""
    return create_challenge(req.wallet_address)


@router.post("/auth/verify")
def post_verify(req: VerifyRequest):
    """Redeem a signed nonce for a 30-day bearer token."""
    return verify_and_mint(req.wallet_address, req.nonce, req.signature)
