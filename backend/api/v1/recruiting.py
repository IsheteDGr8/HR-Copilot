"""Recruiting ATS API — list / patch applicants for the Side Canvas tracker."""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core.security.jwt_auth import verify_jwt
from integrations.graph_tools import schedule_interview_event
from tools.azure_cosmos import (
    APPLICANT_STATUSES,
    get_applicant,
    list_applicants,
    update_applicant,
)

router = APIRouter(prefix="/recruiting", tags=["recruiting"])


class ApplicantPatch(BaseModel):
    status: Optional[str] = None
    requisition_id: Optional[str] = None
    notes: Optional[str] = None
    schedule_interview: bool = False
    candidate_email: Optional[str] = None
    interviewer_emails: Optional[list[str]] = None


@router.get("/applicants")
async def get_applicants(
    requisition_id: str = Query(..., min_length=1),
    user: dict = Depends(verify_jwt),
):
    rows = list_applicants(requisition_id)
    return {"ok": True, "requisition_id": requisition_id, "applicants": rows}


@router.patch("/applicants/{applicant_id}")
async def patch_applicant(
    applicant_id: str,
    body: ApplicantPatch,
    user: dict = Depends(verify_jwt),
):
    doc = get_applicant(applicant_id, body.requisition_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Applicant not found")

    updates: Dict[str, Any] = {}
    if body.status:
        if body.status not in APPLICANT_STATUSES:
            raise HTTPException(
                status_code=400,
                detail=f"status must be one of {list(APPLICANT_STATUSES)}",
            )
        updates["status"] = body.status
    if body.notes is not None:
        updates["notes"] = body.notes

    interview_meta: Dict[str, Any] = {}
    if body.schedule_interview:
        cal = schedule_interview_event(
            candidate_name=str(doc.get("name") or "Candidate"),
            candidate_email=body.candidate_email or "",
            interviewer_emails=body.interviewer_emails,
            job_role=str(doc.get("job_role") or ""),
            requisition_id=str(doc.get("requisitionId") or body.requisition_id or ""),
            user_id=str(user.get("user_id") or ""),
        )
        interview_meta = cal
        updates["status"] = "Interviewing"
        updates["meeting_link"] = cal.get("meeting_link")
        updates["interview_slot"] = (cal.get("event") or {}).get("start")

    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")

    saved = update_applicant(
        applicant_id,
        updates,
        requisition_id=str(doc.get("requisitionId") or body.requisition_id or "") or None,
    )
    if not saved:
        raise HTTPException(status_code=404, detail="Applicant not found")
    return {"ok": True, "applicant": saved, "interview": interview_meta or None}
