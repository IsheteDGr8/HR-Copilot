"""Payroll / timesheet business logic — roster reconciliation, summaries, anomalies."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from core.security.tool_gates import check_employee_lookup_gate
from services.database import list_employees
from tools.azure_cosmos import (
    get_payroll_run_by_period,
    list_timesheets,
    update_timesheet,
    upsert_payroll_run,
)

SUBMITTED_STATUSES = frozenset({"submitted", "approved", "paid"})
EXPECTED_HOURS = 80.0
OVERTIME_THRESHOLD = 15.0
UNDER_HOURS_THRESHOLD = 72.0


def _today() -> date:
    return datetime.now(timezone.utc).date()


def _period_bounds(period_index: int, year: int = 2026) -> tuple[str, str, str]:
    """Bi-weekly periods anchored to Jan 1 of `year`. index 1 = first period."""
    start = date(year, 1, 1) + timedelta(days=(period_index - 1) * 14)
    end = start + timedelta(days=13)
    pid = f"{year}-PP{period_index:02d}"
    return pid, start.isoformat(), end.isoformat()


def current_pay_period_id() -> str:
    """Return the pay period id for today (bi-weekly from Jan 1)."""
    today = _today()
    year = today.year
    anchor = date(year, 1, 1)
    days = (today - anchor).days
    index = max(1, (days // 14) + 1)
    pid, _, _ = _period_bounds(index, year)
    return pid


def _employee_display(emp: dict) -> dict:
    return {
        "employee_id": str(emp.get("employeeId") or emp.get("id") or ""),
        "name": str(emp.get("name") or emp.get("employee_name") or "Employee"),
        "email": str(emp.get("email") or emp.get("personal_email") or ""),
        "department": str(emp.get("department") or ""),
        "role": str(emp.get("role") or ""),
        "annual_salary": float(emp.get("annualSalary") or emp.get("annual_salary") or 0),
    }


def _load_active_employees(department: str = "") -> List[dict]:
    rows = list_employees(
        department=department or None,
        status="active",
        limit=500,
        _internal=True,
    )
    if isinstance(rows, dict) and rows.get("error"):
        return []
    return [r for r in rows if isinstance(r, dict)]


def _hourly_rate(annual_salary: float) -> float:
    if annual_salary <= 0:
        return 0.0
    return round(annual_salary / 2080.0, 2)


def _detect_row_anomalies(row: dict, emp: dict | None = None) -> List[str]:
    flags: List[str] = []
    ot = float(row.get("overtimeHours") or 0)
    total = float(row.get("totalHours") or 0)
    regular = float(row.get("regularHours") or 0)
    if ot > OVERTIME_THRESHOLD:
        flags.append(f"High overtime ({ot}h)")
    if total > 0 and total < UNDER_HOURS_THRESHOLD:
        flags.append(f"Under hours ({total}h vs {EXPECTED_HOURS}h expected)")
    if total > EXPECTED_HOURS + 10:
        flags.append(f"Excessive hours ({total}h)")
    entries = row.get("entries") or []
    weekend_hours = sum(
        float(e.get("hours") or 0)
        for e in entries
        if isinstance(e, dict) and _is_weekend(str(e.get("date") or ""))
    )
    if weekend_hours >= 8:
        flags.append(f"Weekend work spike ({weekend_hours}h)")
    if emp:
        salary = float(emp.get("annualSalary") or emp.get("annual_salary") or 0)
        gross = float(row.get("grossPay") or 0)
        if salary > 0 and gross > 0:
            implied = gross / max(total, 1) * 2080
            if implied > salary * 1.15:
                flags.append("Gross pay exceeds salary band (>15%)")
    return flags


def _is_weekend(day_iso: str) -> bool:
    try:
        d = date.fromisoformat(day_iso[:10])
        return d.weekday() >= 5
    except ValueError:
        return False


def get_timesheet_status(
    pay_period_id: str = "",
    department: str = "",
) -> dict:
    blocked = check_employee_lookup_gate()
    if blocked:
        return blocked

    period = (pay_period_id or "").strip() or current_pay_period_id()
    employees = _load_active_employees(department)
    timesheets = list_timesheets(pay_period_id=period, department=department or None)
    by_emp: Dict[str, dict] = {}
    for row in timesheets:
        eid = str(row.get("employeeId") or "")
        if eid:
            by_emp[eid] = row

    submitted: List[dict] = []
    missing: List[dict] = []
    pending_approval: List[dict] = []

    for emp in employees:
        info = _employee_display(emp)
        eid = info["employee_id"]
        row = by_emp.get(eid)
        if not row:
            missing.append({**info, "status": "missing", "timesheet_id": None})
            continue
        status = str(row.get("status") or "open")
        entry = {
            **info,
            "status": status,
            "timesheet_id": row.get("id"),
            "total_hours": float(row.get("totalHours") or 0),
            "overtime_hours": float(row.get("overtimeHours") or 0),
            "gross_pay": float(row.get("grossPay") or 0),
            "anomalies": list(row.get("anomalies") or []),
        }
        if status == "open":
            missing.append(entry)
        elif status == "submitted":
            pending_approval.append(entry)
        elif status in SUBMITTED_STATUSES:
            submitted.append(entry)

    return {
        "ok": True,
        "pay_period_id": period,
        "department": department or None,
        "employee_count": len(employees),
        "submitted_count": len(submitted) + len(pending_approval),
        "missing_count": len(missing),
        "pending_approval_count": len(pending_approval),
        "submitted": submitted[:50],
        "missing": missing[:50],
        "pending_approval": pending_approval[:50],
        "status": "ready_for_review",
    }


def get_payroll_summary(pay_period_id: str = "") -> dict:
    blocked = check_employee_lookup_gate()
    if blocked:
        return blocked

    period = (pay_period_id or "").strip() or current_pay_period_id()
    timesheets = list_timesheets(pay_period_id=period)
    employees = _load_active_employees()
    emp_map = {str(e.get("employeeId") or e.get("id") or ""): e for e in employees}

    total_gross = 0.0
    total_ot = 0.0
    by_department: Dict[str, dict] = {}
    exceptions: List[dict] = []

    for row in timesheets:
        dept = str(row.get("department") or "Unknown")
        gross = float(row.get("grossPay") or 0)
        ot = float(row.get("overtimeHours") or 0)
        total_gross += gross
        total_ot += ot
        bucket = by_department.setdefault(
            dept,
            {"department": dept, "employee_count": 0, "gross": 0.0, "overtime_hours": 0.0},
        )
        bucket["employee_count"] += 1
        bucket["gross"] += gross
        bucket["overtime_hours"] += ot
        flags = list(row.get("anomalies") or [])
        if not flags:
            flags = _detect_row_anomalies(row, emp_map.get(str(row.get("employeeId") or "")))
        if flags:
            exceptions.append(
                {
                    "employee_id": row.get("employeeId"),
                    "employee_name": row.get("employeeName"),
                    "department": dept,
                    "anomalies": flags,
                    "timesheet_id": row.get("id"),
                }
            )

    status = get_timesheet_status(period)
    missing_count = int(status.get("missing_count") or 0)
    submitted_count = int(status.get("submitted_count") or 0)
    total_net = round(total_gross * 0.72, 2)

    run = upsert_payroll_run(
        pay_period_id=period,
        period_start=str(timesheets[0].get("payPeriodStart") or "") if timesheets else "",
        period_end=str(timesheets[0].get("payPeriodEnd") or "") if timesheets else "",
        status="processing" if missing_count else "closed",
        employee_count=len(employees),
        submitted_count=submitted_count,
        missing_count=missing_count,
        total_gross=round(total_gross, 2),
        total_net=total_net,
        total_overtime=round(total_ot, 2),
        by_department=by_department,
        exceptions=exceptions[:25],
    )

    return {
        "ok": True,
        "pay_period_id": period,
        "run": run,
        "employee_count": len(employees),
        "timesheet_count": len(timesheets),
        "submitted_count": submitted_count,
        "missing_count": missing_count,
        "total_gross": round(total_gross, 2),
        "total_net": total_net,
        "total_overtime": round(total_ot, 2),
        "by_department": by_department,
        "exceptions": exceptions[:25],
        "status": "ready_for_review",
    }


def detect_anomalies(pay_period_id: str = "", department: str = "") -> dict:
    blocked = check_employee_lookup_gate()
    if blocked:
        return blocked

    period = (pay_period_id or "").strip() or current_pay_period_id()
    timesheets = list_timesheets(pay_period_id=period, department=department or None)
    employees = _load_active_employees(department)
    emp_map = {str(e.get("employeeId") or e.get("id") or ""): e for e in employees}

    flagged: List[dict] = []
    for row in timesheets:
        eid = str(row.get("employeeId") or "")
        flags = list(row.get("anomalies") or [])
        if not flags:
            flags = _detect_row_anomalies(row, emp_map.get(eid))
        if flags:
            flagged.append(
                {
                    "employee_id": eid,
                    "employee_name": row.get("employeeName"),
                    "department": row.get("department"),
                    "timesheet_id": row.get("id"),
                    "status": row.get("status"),
                    "total_hours": float(row.get("totalHours") or 0),
                    "overtime_hours": float(row.get("overtimeHours") or 0),
                    "gross_pay": float(row.get("grossPay") or 0),
                    "anomalies": flags,
                }
            )

    return {
        "ok": True,
        "pay_period_id": period,
        "department": department or None,
        "flagged_count": len(flagged),
        "flagged": flagged[:50],
        "status": "ready_for_review",
    }


def approve_timesheet(timesheet_id: str, employee_id: str = "") -> dict:
    updated = update_timesheet(
        timesheet_id,
        {"status": "approved", "approvedAt": datetime.now(timezone.utc).isoformat()},
        employee_id=employee_id or None,
    )
    if not updated:
        return {"ok": False, "error": "Timesheet not found."}
    return {"ok": True, "timesheet": updated}


def reject_timesheet(timesheet_id: str, reason: str = "", employee_id: str = "") -> dict:
    updated = update_timesheet(
        timesheet_id,
        {
            "status": "rejected",
            "anomalies": [reason or "Rejected by HR"],
        },
        employee_id=employee_id or None,
    )
    if not updated:
        return {"ok": False, "error": "Timesheet not found."}
    return {"ok": True, "timesheet": updated}


def resolve_non_submitters(pay_period_id: str = "", department: str = "") -> dict:
    status = get_timesheet_status(pay_period_id, department)
    if not status.get("ok"):
        return status
    missing = status.get("missing") or []
    employee_ids = [str(m.get("employee_id") or "") for m in missing if m.get("employee_id")]
    emails = [str(m.get("email") or "") for m in missing if m.get("email")]
    return {
        "ok": True,
        "pay_period_id": status.get("pay_period_id"),
        "missing_count": len(missing),
        "employee_ids": employee_ids,
        "emails": emails,
        "missing": missing,
    }
