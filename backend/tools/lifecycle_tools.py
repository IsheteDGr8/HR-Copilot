"""Lifecycle transfer tooling — deterministic transfer packet + RCW 49.62 re-check.

The Lifecycle worker drafts (never writes). The Execution agent applies the
change only when the latest user message contains [UPDATE APPROVED].
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from tools.compliance_validator import noncompete_allowed
from tools.azure_cosmos import lookup_employee

logger = logging.getLogger(__name__)

# In-process stash mirroring the onboarding packet pattern.
_TRANSFERS: Dict[str, dict] = {}


def stash_transfer(user_id: str, packet: dict) -> None:
    key = (user_id or "").strip()
    if key:
        _TRANSFERS[key] = packet
    email = str(packet.get("email") or "").strip().lower()
    if email:
        _TRANSFERS[f"email:{email}"] = packet


def get_stashed_transfer(user_id: str, email: str = "") -> Optional[dict]:
    uid = (user_id or "").strip()
    if uid and uid in _TRANSFERS:
        return _TRANSFERS[uid]
    em = (email or "").strip().lower()
    if em and f"email:{em}" in _TRANSFERS:
        return _TRANSFERS[f"email:{em}"]
    if _TRANSFERS:
        return next(reversed(list(_TRANSFERS.values())))
    return None


def _as_float(value: Any) -> float:
    try:
        if value in (None, ""):
            return 0.0
        return float(str(value).replace(",", "").replace("$", "").strip())
    except (TypeError, ValueError):
        return 0.0


def _emp_salary(record: dict) -> float:
    return _as_float(record.get("annualSalary") or record.get("salary"))


def compile_transfer_packet(
    employee_query: str = "",
    employee_id: str = "",
    new_role: str = "",
    new_department: str = "",
    new_manager_id: str = "",
    new_salary: Any = None,
    effective_date: str = "",
    employment_type: str = "",
) -> dict:
    """Build a transfer packet with compensation deltas + a drafted memo.

    Accepts `employee_id` or a free-text `employee_query` (name/email).
    Returns {ok: False, error} on lookup/validation failure so the worker can
    ask the user for missing details instead of crashing the stream.
    """
    try:
        query = (employee_id or employee_query or "").strip()
        record = lookup_employee(query)
        if not record or record.get("error"):
            return {"ok": False, "error": record.get("error") if isinstance(record, dict) else "Employee not found."}

        emp_id = str(record.get("employeeId") or record.get("id") or "")
        name = str(record.get("name") or record.get("employee_name") or "").strip()
        email = str(record.get("email") or record.get("personal_email") or "").strip()
        emp_type = (employment_type or record.get("employmentType") or "W-2").strip()

        old_salary = _emp_salary(record)
        new_salary_f = _as_float(new_salary) if new_salary not in (None, "") else old_salary
        salary_delta = round(new_salary_f - old_salary, 2)
        pct_change = round((salary_delta / old_salary) * 100, 2) if old_salary else 0.0

        old_department = str(record.get("department") or "").strip()
        target_department = (new_department or old_department).strip()
        old_manager = str(record.get("managerId") or record.get("manager") or "").strip()
        target_manager = (new_manager_id or old_manager).strip()
        old_role = str(record.get("role") or record.get("title") or "").strip()
        target_role = (new_role or old_role).strip()

        # RCW 49.62 re-check: does this transfer cross the non-compete threshold?
        was_allowed, _ = noncompete_allowed(old_salary, emp_type)
        now_allowed, compliance_reason = noncompete_allowed(new_salary_f, emp_type)
        had_nda = bool(
            record.get("ndaSigned")
            or record.get("nda_signed")
            or record.get("hasNda")
            or record.get("has_nda")
        )
        # Flag only when crossing into the enforceable band AND no prior NDA on file.
        nda_addendum_required = (not was_allowed) and now_allowed and (not had_nda)

        nda_link = ""
        if nda_addendum_required:
            try:
                from tools.azure_blob import resolve_onboarding_doc_urls

                nda_link = (resolve_onboarding_doc_urls(include_nda=True).get("nda") or {}).get("url") or ""
            except Exception:
                logger.debug("NDA SAS resolution failed for transfer addendum", exc_info=True)

        memo = _render_transfer_memo(
            name=name,
            emp_id=emp_id,
            old_department=old_department,
            new_department=target_department,
            old_role=old_role,
            new_role=target_role,
            old_manager=old_manager,
            new_manager=target_manager,
            old_salary=old_salary,
            new_salary=new_salary_f,
            salary_delta=salary_delta,
            pct_change=pct_change,
            effective_date=effective_date,
            nda_addendum_required=nda_addendum_required,
        )

        return {
            "ok": True,
            "status": "awaiting_approval",
            "employee_id": emp_id,
            "employee_name": name,
            "email": email,
            "employment_type": emp_type,
            "effective_date": effective_date,
            "changes": {
                "role": {"from": old_role, "to": target_role},
                "department": {"from": old_department, "to": target_department},
                "manager": {"from": old_manager, "to": target_manager},
                "salary": {"from": old_salary, "to": new_salary_f},
            },
            "salary_delta": salary_delta,
            "pct_change": pct_change,
            "compliance": {
                "rcw_4962_reason": compliance_reason,
                "noncompete_allowed": now_allowed,
                "nda_addendum_required": nda_addendum_required,
                "threshold": 126858.83,
            },
            "nda_addendum_required": nda_addendum_required,
            "nda_link": nda_link,
            "transfer_memo": memo,
        }
    except Exception as exc:
        logger.exception("compile_transfer_packet failed")
        return {"ok": False, "error": str(exc)}


def _render_transfer_memo(
    *,
    name: str,
    emp_id: str,
    old_department: str,
    new_department: str,
    old_role: str,
    new_role: str,
    old_manager: str,
    new_manager: str,
    old_salary: float,
    new_salary: float,
    salary_delta: float,
    pct_change: float,
    effective_date: str,
    nda_addendum_required: bool,
) -> str:
    lines = [
        "INTERNAL TRANSFER MEMO",
        f"Employee: {name} ({emp_id})",
        f"Effective date: {effective_date or 'TBD'}",
        "",
    ]
    if new_role != old_role:
        lines.append(f"- Role / title: {old_role or '—'} -> {new_role}")
    if new_department != old_department:
        lines.append(f"- Department: {old_department or '—'} -> {new_department}")
    if new_manager != old_manager:
        lines.append(f"- Manager: {old_manager or '—'} -> {new_manager}")
    if salary_delta:
        sign = "+" if salary_delta >= 0 else "-"
        lines.append(
            f"- Compensation: ${old_salary:,.2f} -> ${new_salary:,.2f} "
            f"({sign}${abs(salary_delta):,.2f}, {pct_change:+.2f}%)"
        )
    if nda_addendum_required:
        lines += [
            "",
            "COMPLIANCE (RCW 49.62): This promotion moves compensation above the 2026 "
            "non-compete threshold ($126,858.83 for W-2). A new NDA / non-compete addendum "
            "is attached and must be signed as part of this transfer.",
        ]
    lines += ["", "Approve in the Side Canvas to apply this change ([UPDATE APPROVED])."]
    return "\n".join(lines)
