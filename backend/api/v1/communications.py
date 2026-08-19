"""Bulk email API — preview audiences and execute approved campaigns."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.agent.user_context import set_current_user_id
from core.security.jwt_auth import verify_jwt
from services.bulk_email import (
    draft_bulk_campaign,
    get_stashed_bulk_campaign,
    resolve_recipients,
    send_bulk_campaign,
)
from services.database import list_employees

router = APIRouter(prefix="/communications", tags=["communications"])


class BulkAudienceQuery(BaseModel):
    department: Optional[str] = None
    employee_ids: Optional[List[str]] = None
    emails: Optional[List[str]] = None
    status: Optional[str] = "active"
    search: Optional[str] = None
    limit: int = Field(200, ge=1, le=500)


class BulkDraftRequest(BaseModel):
    subject: str = Field(..., min_length=1)
    body_template: str = Field(..., min_length=1)
    department: Optional[str] = None
    employee_ids: Optional[List[str]] = None
    emails: Optional[List[str]] = None
    status: Optional[str] = "active"
    search: Optional[str] = None
    title: Optional[str] = None


class BulkSendRequest(BaseModel):
    campaign_id: Optional[str] = None
    subject: Optional[str] = None
    body_template: Optional[str] = None


def _user_id(user: dict) -> str:
    return str(user.get("user_id") or user.get("sub") or "")


@router.get("/employees")
async def get_employees(
    department: Optional[str] = None,
    status: Optional[str] = "active",
    search: Optional[str] = None,
    limit: int = 200,
    user: dict = Depends(verify_jwt),
):
    set_current_user_id(_user_id(user))
    rows = list_employees(
        department=department,
        status=status,
        search=search,
        limit=limit,
        _internal=True,
    )
    if isinstance(rows, dict) and rows.get("error"):
        raise HTTPException(status_code=400, detail=rows["error"])
    items = []
    for emp in rows:
        items.append(
            {
                "id": emp.get("employeeId") or emp.get("id"),
                "name": emp.get("name") or emp.get("employee_name"),
                "email": emp.get("email") or emp.get("personal_email"),
                "department": emp.get("department"),
                "role": emp.get("role"),
                "status": emp.get("status") or "active",
            }
        )
    return {"ok": True, "count": len(items), "employees": items}


@router.post("/bulk/preview")
async def preview_bulk_audience(body: BulkAudienceQuery, user: dict = Depends(verify_jwt)):
    set_current_user_id(_user_id(user))
    recipients = resolve_recipients(
        department=body.department or "",
        employee_ids=body.employee_ids,
        emails=body.emails,
        status=body.status or "active",
        search=body.search or "",
        limit=body.limit,
    )
    preview = [
        {
            "employee_id": r.get("employeeId") or r.get("id"),
            "name": r.get("name") or r.get("employee_name"),
            "email": r.get("email") or r.get("personal_email"),
            "department": r.get("department"),
        }
        for r in recipients[:25]
    ]
    return {"ok": True, "count": len(recipients), "preview": preview}


@router.post("/bulk/draft")
async def draft_bulk(body: BulkDraftRequest, user: dict = Depends(verify_jwt)):
    uid = _user_id(user)
    set_current_user_id(uid)
    campaign = draft_bulk_campaign(
        subject=body.subject,
        body_template=body.body_template,
        department=body.department or "",
        employee_ids=body.employee_ids,
        emails=body.emails,
        status=body.status or "active",
        search=body.search or "",
        title=body.title or "",
        user_id=uid,
    )
    if not campaign.get("ok"):
        raise HTTPException(status_code=400, detail=campaign.get("error") or "Draft failed")
    return {"ok": True, "campaign": campaign}


@router.post("/bulk/send")
async def send_bulk(body: BulkSendRequest, user: dict = Depends(verify_jwt)):
    uid = _user_id(user)
    set_current_user_id(uid)
    campaign = get_stashed_bulk_campaign(uid)
    if not campaign:
        raise HTTPException(status_code=404, detail="No bulk campaign awaiting send.")
    if body.campaign_id and body.campaign_id != campaign.get("campaign_id"):
        raise HTTPException(status_code=400, detail="Campaign id mismatch.")
    result = send_bulk_campaign(
        campaign,
        uid,
        subject_override=body.subject or "",
        body_template_override=body.body_template or "",
    )
    if not result.get("ok") and result.get("sent_count", 0) == 0:
        raise HTTPException(status_code=500, detail=result.get("error") or result.get("summary"))
    return {"ok": True, "result": result}
