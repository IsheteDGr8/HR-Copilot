"""Helpdesk tooling: deterministic ticket packets + in-memory stash for HITL."""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, Optional

from tools.azure_cosmos import create_hr_ticket, lookup_employee
from tools.policy_search import search_corporate_policies

logger = logging.getLogger(__name__)

_TICKETS: Dict[str, dict] = {}

_CATEGORY_RULES = (
    ("Benefits", ("benefit", "dental", "medical", "vision", "401", "insurance", "coverage")),
    ("PTO / Leave", ("pto", "vacation", "time off", "leave", "fmla", "parental")),
    ("Compensation", ("salary", "pay", "bonus", "raise", "compensation", "band")),
    ("Workplace", ("remote", "hybrid", "harassment", "conduct", "manager", "conflict")),
    ("Onboarding", ("onboard", "i-9", "i9", "nda", "badge", "laptop")),
)


def stash_ticket(user_id: str, packet: dict) -> None:
    key = (user_id or "").strip()
    if key:
        _TICKETS[key] = packet


def get_stashed_ticket(user_id: str) -> Optional[dict]:
    uid = (user_id or "").strip()
    if uid and uid in _TICKETS:
        return _TICKETS[uid]
    if _TICKETS:
        return next(reversed(list(_TICKETS.values())))
    return None


def _classify_category(question: str) -> str:
    q = (question or "").lower()
    for label, keys in _CATEGORY_RULES:
        if any(k in q for k in keys):
            return label
    return "General"


def _priority_for(question: str, category: str) -> str:
    q = (question or "").lower()
    if any(k in q for k in ("urgent", "asap", "immediately", "harassment", "safety")):
        return "Urgent"
    if category in ("Compensation", "Workplace") or any(k in q for k in ("deadline", "today", "legal")):
        return "High"
    if category in ("Benefits", "PTO / Leave"):
        return "Medium"
    return "Low"


def _draft_response(*, employee_name: str, question: str, category: str, policy_text: str) -> str:
    name = employee_name or "there"
    policy = (policy_text or "").strip()
    excerpt = policy[:900] + ("…" if len(policy) > 900 else "")
    cite = excerpt if excerpt else "(No policy excerpt was retrieved — please have HR confirm before sending.)"
    return (
        f"Hi {name},\n\n"
        f"Thanks for reaching out to HR about your {category.lower()} question.\n\n"
        f"You asked: \"{question.strip()}\"\n\n"
        "Per our corporate policy reference:\n"
        f"\"{cite}\"\n\n"
        "Based on that guidance, please follow the process described above. "
        "If anything is unclear or your situation is an exception, reply to this "
        "message and we will follow up.\n\n"
        "Best regards,\n"
        "HR Helpdesk"
    )


def compile_helpdesk_ticket(
    question: str,
    *,
    employee_query: str = "",
    employee_id: str = "",
    employee_name: str = "",
    employee_email: str = "",
    category: str = "",
    priority: str = "",
) -> dict:
    """Search policies and persist an Open HR ticket for Side Canvas review."""
    q = (question or "").strip()
    if not q:
        return {"ok": False, "error": "question is required."}

    emp: Dict[str, Any] = {}
    if employee_query.strip():
        emp = lookup_employee(employee_query.strip())
        if emp.get("error"):
            emp = {}

    emp_id = (
        employee_id
        or str(emp.get("employeeId") or emp.get("id") or "")
        or re.sub(r"[^a-zA-Z0-9_-]+", "-", (employee_email or employee_name or "unknown").lower())[:40]
        or "unknown"
    )
    name = employee_name or str(emp.get("name") or emp.get("employee_name") or "") or "Employee"
    email = employee_email or str(emp.get("email") or emp.get("personal_email") or "")

    cat = (category or "").strip() or _classify_category(q)
    pri = (priority or "").strip() or _priority_for(q, cat)
    # Pass the employee question into corporate policy retrieval (Blob RAG / Search).
    policy = search_corporate_policies(q)
    policy_text = str(policy.get("text") or "").strip()
    drafted = _draft_response(
        employee_name=name.split()[0] if name else "there",
        question=q,
        category=cat,
        policy_text=policy_text,
    )

    try:
        saved = create_hr_ticket(
            employee_id=emp_id,
            category=cat,
            priority=pri,
            question=q,
            suggested_response=drafted,
            policy_reference=policy_text,
            employee_name=name,
            employee_email=email,
            status="Open",
        )
    except Exception as exc:
        logger.exception("create_hr_ticket failed")
        return {"ok": False, "error": f"Could not persist HR ticket: {exc}"}

    return {
        "ok": True,
        "status": "awaiting_approval",
        "ticket_id": saved.get("id"),
        "employee_id": emp_id,
        "employee_name": name,
        "employee_email": email,
        "ticket_category": cat,
        "priority_level": pri,
        "question": q,
        "ai_summary": f"{cat} question ({pri} priority) for {name}.",
        "policy_reference": policy_text,
        "policy_excerpts": policy.get("excerpts") or [],
        "policy_mode": policy.get("mode"),
        "drafted_response": drafted,
        "suggested_response": drafted,
        "cosmos": saved,
    }
