"""Global HR dashboard summary for the Side Canvas."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from core.security.jwt_auth import verify_jwt
from tools.azure_cosmos import get_dashboard_summary

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
async def dashboard_summary(user: dict = Depends(verify_jwt)):
    """Lightweight Cosmos counts for onboarding, helpdesk, and ATS."""
    _ = user
    return get_dashboard_summary()
