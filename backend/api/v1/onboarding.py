from __future__ import annotations
 
from typing import Dict
 
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
 
from core.security.jwt_auth import verify_jwt
from tools.azure_cosmos import get_onboarding_checklist, update_onboarding_checklist, get_container
 
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
 
 
@router.get("/checklist-summary")
async def get_all_onboarding_checklists(user: dict = Depends(verify_jwt)):
    """
    Returns every employee currently onboarding, with their real done/pending
    steps computed from their actual asset records. This is what the
    Checklist page in the frontend calls directly (not through chat).
    """
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
            assets_container.query_items(query=assets_query, parameters=params, enable_cross_partition_query=True)
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
 