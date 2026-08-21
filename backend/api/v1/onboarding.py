"""Onboarding checklist read/patch API for the Side Canvas tracker and Checklist page."""

from __future__ import annotations

from typing import Dict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.security.jwt_auth import verify_jwt
from tools.azure_cosmos import (
    CHECKLIST_BOOL_FLAGS,
    get_container,
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


@router.get("/checklist-summary")
async def get_all_onboarding_checklists(user: dict = Depends(verify_jwt)):
    """
    Returns every employee currently onboarding, with their real done/pending
    steps computed from their actual asset records. This is what the
    Checklist page in the frontend calls directly (not through chat).
    """
    _ = user
    employees_container = get_container("employees")
    assets_container = get_container("assets")

    employees_query = "SELECT * FROM c WHERE c.status = 'onboarding'"
    onboarding_employees = list(
        employees_container.query_items(query=employees_query, enable_cross_partition_query=True)
    )

    results = []
    for emp in onboarding_employees:
        assets_query = "SELECT * FROM c WHERE c.employeeId = @empId"
        params = [{"name": "@empId", "value": emp["employeeId"]}]
        emp_assets = list(
            assets_container.query_items(
                query=assets_query, parameters=params, enable_cross_partition_query=True
            )
        )

        done = []
        pending = []

        has_any_issued = any(a["status"] == "issued" for a in emp_assets)
        if has_any_issued:
            done += ["Welcome email sent", "Onboarding documents sent"]
        else:
            pending += ["Welcome email sent", "Onboarding documents sent"]

        for a in emp_assets:
            label = f"{a['assetType']} issued"
            if a["status"] == "issued":
                done.append(label)
            else:
                pending.append(label)

        results.append({
            "employeeId": emp["employeeId"],
            "name": emp["name"],
            "role": emp["role"],
            "department": emp["department"],
            "hireDate": emp["hireDate"],
            "done": done,
            "pending": pending,
        })

    results.sort(key=lambda r: r["hireDate"])

    return {"employees": results}
