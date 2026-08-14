"""Benefits eligibility rules engine for employee onboarding."""

from __future__ import annotations

from typing import Any, Dict, List, Optional


DEFAULT_BENEFITS_CATALOG: List[Dict[str, Any]] = [
    {
        "id": "standard_health",
        "name": "Standard Health Plan",
        "description": "Company-sponsored medical, dental, and vision coverage for full-time employees.",
        "eligibility_rules": {
            "min_salary": 0,
        },
    },
    {
        "id": "executive_health",
        "name": "Executive Health Plan",
        "description": "Enhanced medical coverage, annual executive physical, and concierge care.",
        "eligibility_rules": {
            "min_salary": 150000,
            "role_keywords": ["director", "vp", "vice president", "chief", "executive", "head of"],
        },
    },
    {
        "id": "commuter_stipend",
        "name": "Commuter Stipend",
        "description": "Monthly stipend for transit, parking, or EV charging near HQ campuses.",
        "eligibility_rules": {
            "departments": ["engineering", "product", "design", "operations", "people", "hr", "finance"],
            "min_salary": 50000,
        },
    },
    {
        "id": "wellness_allowance",
        "name": "Wellness Allowance",
        "description": "Annual wellness and fitness reimbursement for eligible staff.",
        "eligibility_rules": {
            "min_salary": 40000,
        },
    },
]


def _as_int(value: Any, default: int = 0) -> int:
    try:
        if value is None or value == "":
            return default
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _norm(value: Any) -> str:
    return str(value or "").strip().lower()


def _matches_rules(employee_data: dict, rules: Optional[dict]) -> bool:
    """Return True when the employee satisfies all configured eligibility rules."""
    if not rules:
        return True

    salary = _as_int(employee_data.get("salary"), 0)
    department = _norm(employee_data.get("department"))
    role = _norm(employee_data.get("role"))

    min_salary = rules.get("min_salary")
    if min_salary is not None and salary < _as_int(min_salary, 0):
        return False

    departments = rules.get("departments")
    if departments:
        allowed = {_norm(d) for d in departments}
        if department not in allowed:
            return False

    role_keywords = rules.get("role_keywords")
    if role_keywords:
        if not any(_norm(k) in role for k in role_keywords):
            return False

    max_salary = rules.get("max_salary")
    if max_salary is not None and salary > _as_int(max_salary, 10**12):
        return False

    return True


def evaluate_benefits(employee_data: dict) -> List[dict]:
    """Return catalog benefits the employee qualifies for.

    `employee_data` may include: salary, department, role, first_name, last_name, etc.
    """
    data = employee_data or {}
    qualified: List[dict] = []
    for benefit in DEFAULT_BENEFITS_CATALOG:
        rules = benefit.get("eligibility_rules") or {}
        if _matches_rules(data, rules):
            qualified.append(
                {
                    "id": benefit.get("id"),
                    "name": benefit.get("name"),
                    "description": benefit.get("description"),
                    "eligibility_rules": rules,
                }
            )
    return qualified
