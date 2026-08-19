"""Tool-level scope enforcement."""

from __future__ import annotations

from core.security.scope_context import bypass_scope, employee_lookup_allowed, hr_scope_allowed

EMPLOYEE_LOOKUP_BLOCKED = (
    "Employee record lookup is not allowed for this request. "
    "If you are asking about someone in our systems, say so explicitly "
    "(e.g. 'look up Rajnikanth as an employee') or confirm when prompted."
)


def check_employee_lookup_gate() -> dict | None:
    """Return an error dict if lookup should be blocked, else None."""
    if bypass_scope.get():
        return None
    if employee_lookup_allowed.get() or hr_scope_allowed.get():
        return None
    return {"error": EMPLOYEE_LOOKUP_BLOCKED, "scope_blocked": True, "found": False}
