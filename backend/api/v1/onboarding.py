"""Onboarding checklist read/patch API for the Side Canvas tracker."""

from __future__ import annotations

from typing import Dict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.security.jwt_auth import verify_jwt
from tools.azure_cosmos import get_onboarding_checklist, update_onboarding_checklist

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


class ChecklistPatch(BaseModel):
    updates: Dict[str, bool]


@router.get("/checklists/{employee_id}")
async def read_checklist(employee_id: str, user: dict = Depends(verify_jwt)):
    doc = get_onboarding_checklist(employee_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Checklist not found")
    return doc


@router.patch("/checklists/{employee_id}")
async def patch_checklist(
    employee_id: str,
    body: ChecklistPatch,
    user: dict = Depends(verify_jwt),
):
    doc = update_onboarding_checklist(employee_id, body.updates)
    if not doc:
        raise HTTPException(status_code=404, detail="Checklist not found")
    return doc
