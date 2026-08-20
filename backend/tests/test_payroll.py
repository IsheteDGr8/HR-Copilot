"""Unit tests for payroll timesheet reconciliation and anomaly rules."""

from __future__ import annotations

import sys
from unittest.mock import patch

sys.path.insert(0, ".")

from services import payroll as pr


def test_missing_timesheet_detection():
    employees = [
        {"employeeId": "emp-0001", "name": "A", "email": "a@co.com", "department": "Eng", "status": "active"},
        {"employeeId": "emp-0002", "name": "B", "email": "b@co.com", "department": "Eng", "status": "active"},
    ]
    timesheets = [
        {
            "employeeId": "emp-0001",
            "status": "submitted",
            "employeeName": "A",
            "department": "Eng",
            "totalHours": 80,
            "overtimeHours": 0,
            "grossPay": 4000,
        },
        {
            "employeeId": "emp-0002",
            "status": "open",
            "employeeName": "B",
            "department": "Eng",
            "totalHours": 80,
            "overtimeHours": 0,
            "grossPay": 4000,
        },
    ]

    with patch.object(pr, "check_employee_lookup_gate", return_value=None):
        with patch.object(pr, "_load_active_employees", return_value=employees):
            with patch.object(pr, "list_timesheets", return_value=timesheets):
                status = pr.get_timesheet_status("2026-PP17")

    assert status["ok"] is True
    assert status["missing_count"] == 1
    assert status["missing"][0]["employee_id"] == "emp-0002"


def test_anomaly_overtime_flag():
    row = {
        "overtimeHours": 18,
        "totalHours": 98,
        "entries": [{"date": "2026-08-15", "hours": 8}],
        "grossPay": 5000,
    }
    flags = pr._detect_row_anomalies(row, {"annualSalary": 100000})
    assert any("overtime" in f.lower() for f in flags)


def test_resolve_non_submitters():
    status = {
        "ok": True,
        "pay_period_id": "2026-PP17",
        "missing": [{"employee_id": "emp-0003", "email": "c@co.com"}],
    }
    with patch.object(pr, "get_timesheet_status", return_value=status):
        out = pr.resolve_non_submitters("2026-PP17")
    assert out["ok"] is True
    assert out["employee_ids"] == ["emp-0003"]
    assert out["emails"] == ["c@co.com"]


if __name__ == "__main__":
    test_missing_timesheet_detection()
    test_anomaly_overtime_flag()
    test_resolve_non_submitters()
    print("All payroll tests passed.")
