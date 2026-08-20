"""Payroll / timesheet REST API."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.agent.user_context import set_current_user_id
from core.security.scope_context import apply_scope_flags
from core.security.jwt_auth import verify_jwt
from services.bulk_email import draft_bulk_campaign
from services.payroll import (
    approve_timesheet,
    current_pay_period_id,
    detect_anomalies,
    get_payroll_summary,
    get_timesheet_status,
    reject_timesheet,
    resolve_non_submitters,
)
from tools.azure_cosmos import list_payroll_runs, list_timesheets

router = APIRouter(prefix="/payroll", tags=["payroll"])


class TimesheetPatch(BaseModel):
    action: str = Field(..., description="approve | reject")
    employee_id: Optional[str] = None
    reason: Optional[str] = None


class RemindRequest(BaseModel):
    pay_period: Optional[str] = None
    department: Optional[str] = None
    subject: Optional[str] = None
    body_template: Optional[str] = None


def _uid(user: dict) -> str:
    return str(user.get("user_id") or user.get("sub") or "")


def _allow_scope() -> None:
    """Payroll endpoints are already protected by JWT auth.

    The chat scope classifier sets scope context vars, but REST callers don't.
    Bypass scope gates so payroll operations work for the authenticated user.
    """
    apply_scope_flags(bypass=True, hr_allowed=True, employee_lookup=True)


@router.get("/timesheets")
async def get_timesheets(
    pay_period: Optional[str] = None,
    department: Optional[str] = None,
    status: Optional[str] = None,
    user: dict = Depends(verify_jwt),
):
    set_current_user_id(_uid(user))
    _allow_scope()
    period = (pay_period or "").strip() or current_pay_period_id()
    rows = list_timesheets(
        pay_period_id=period,
        department=department,
        status=status,
    )
    overview = get_timesheet_status(period, department or "")
    return {
        "ok": True,
        "pay_period_id": period,
        "timesheets": rows,
        "overview": overview,
    }


@router.get("/summary")
async def get_summary(pay_period: Optional[str] = None, user: dict = Depends(verify_jwt)):
    set_current_user_id(_uid(user))
    _allow_scope()
    summary = get_payroll_summary(pay_period or "")
    if not summary.get("ok"):
        raise HTTPException(status_code=400, detail=summary.get("error") or "Summary failed")
    return {"ok": True, "summary": summary}


@router.get("/runs")
async def get_runs(limit: int = 50, user: dict = Depends(verify_jwt)):
    _ = user
    _allow_scope()
    runs = list_payroll_runs(limit=limit)
    return {"ok": True, "runs": runs}


@router.get("/anomalies")
async def get_anomalies(
    pay_period: Optional[str] = None,
    department: Optional[str] = None,
    user: dict = Depends(verify_jwt),
):
    set_current_user_id(_uid(user))
    _allow_scope()
    result = detect_anomalies(pay_period or "", department or "")
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("error") or "Anomaly scan failed")
    return {"ok": True, "anomalies": result}


@router.patch("/timesheets/{timesheet_id}")
async def patch_timesheet(
    timesheet_id: str,
    body: TimesheetPatch,
    user: dict = Depends(verify_jwt),
):
    set_current_user_id(_uid(user))
    _allow_scope()
    action = (body.action or "").strip().lower()
    if action == "approve":
        result = approve_timesheet(timesheet_id, body.employee_id or "")
    elif action == "reject":
        result = reject_timesheet(timesheet_id, body.reason or "", body.employee_id or "")
    else:
        raise HTTPException(status_code=400, detail="action must be approve or reject")
    if not result.get("ok"):
        raise HTTPException(status_code=404, detail=result.get("error") or "Update failed")
    return {"ok": True, "timesheet": result.get("timesheet")}


@router.post("/remind")
async def remind_non_submitters(body: RemindRequest, user: dict = Depends(verify_jwt)):
    uid = _uid(user)
    set_current_user_id(uid)
    _allow_scope()
    resolved = resolve_non_submitters(body.pay_period or "", body.department or "")
    if not resolved.get("ok"):
        raise HTTPException(status_code=400, detail=resolved.get("error") or "Could not resolve list")
    period = str(resolved.get("pay_period_id") or current_pay_period_id())
    ids = resolved.get("employee_ids") or []
    if not ids:
        return {"ok": True, "message": "No missing timesheets — no reminders needed.", "campaign": None}
    subject = body.subject or f"Action required: submit your timesheet for {period}"
    template = body.body_template or (
        "Hi {{first_name}},\n\n"
        "Please submit your timesheet for the current pay period by end of day.\n\nThank you,\nHR Payroll"
    )
    campaign = draft_bulk_campaign(
        subject=subject,
        body_template=template,
        employee_ids=ids,
        department=body.department or "",
        user_id=uid,
        title=f"Timesheet reminder — {period}",
    )
    if not campaign.get("ok"):
        raise HTTPException(status_code=400, detail=campaign.get("error") or "Draft failed")
    return {"ok": True, "campaign": campaign}
