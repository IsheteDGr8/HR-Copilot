"""Onboarding checklist read/patch API for the Side Canvas tracker."""

from __future__ import annotations

from typing import Dict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.security.jwt_auth import verify_jwt
from tools.azure_cosmos import (
    CHECKLIST_BOOL_FLAGS,
    get_onboarding_checklist,
    list_onboarding_checklists,
    update_onboarding_checklist,
)

router = APIRouter(prefix="/onboarding", tags=["onboarding"])

_CHECKLIST_LABELS = {
    "background_check": "Background check",
    "profile_setup": "Profile setup",
    "email_setup": "Email setup",
    "i9_signed": "I-9",
    "nda_signed": "NDA",
    "emergency_contact": "Emergency contact",
    "training_checklist": "Training",
}


class ChecklistPatch(BaseModel):
    updates: Dict[str, bool]


def _dashboard_row(doc: dict) -> dict:
    done: list[str] = []
    pending: list[str] = []
    nda_required = bool(doc.get("nda_required", True))
    for flag in CHECKLIST_BOOL_FLAGS:
        if flag == "nda_signed" and not nda_required:
            continue
        label = _CHECKLIST_LABELS.get(flag, flag.replace("_", " ").title())
        if doc.get(flag):
            done.append(label)
        else:
            pending.append(label)
    hire = (
        doc.get("hireDate")
        or doc.get("hire_date")
        or doc.get("start_date")
        or doc.get("created_at")
        or ""
    )
    return {
        "employeeId": doc.get("employeeId") or doc.get("id") or "",
        "name": doc.get("employee_name") or doc.get("name") or "Unknown",
        "role": doc.get("role") or "",
        "department": doc.get("department") or "",
        "hireDate": str(hire)[:10],
        "done": done,
        "pending": pending,
    }


@router.get("/checklist")
async def list_checklists(user: dict = Depends(verify_jwt)):
    """Roster view for the Checklist page: done vs pending steps per employee."""
    _ = user
    employees = [_dashboard_row(doc) for doc in list_onboarding_checklists()]
    employees.sort(key=lambda row: row.get("name") or "")
    return {"employees": employees}


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
