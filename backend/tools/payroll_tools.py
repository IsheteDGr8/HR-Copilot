"""Agent-facing payroll / timesheet helpers."""

from __future__ import annotations

from services.payroll import (
    detect_anomalies,
    get_payroll_summary,
    get_timesheet_status,
)


def list_missing_timesheets(pay_period: str = "", department: str = "") -> dict:
    status = get_timesheet_status(pay_period, department)
    if not status.get("ok"):
        return status
    missing = status.get("missing") or []
    return {
        "ok": True,
        "pay_period_id": status.get("pay_period_id"),
        "department": status.get("department"),
        "missing_count": len(missing),
        "employee_count": status.get("employee_count"),
        "submitted_count": status.get("submitted_count"),
        "missing": missing,
        "pending_approval": status.get("pending_approval") or [],
        "status": "ready_for_review",
    }


def summarize_payroll_run(pay_period: str = "") -> dict:
    return get_payroll_summary(pay_period)


def flag_timesheet_anomalies(pay_period: str = "", department: str = "") -> dict:
    return detect_anomalies(pay_period, department)
