"""Deterministic onboarding packet — three emails + IT tickets (no LLM copy)."""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from services.benefits import evaluate_benefits
from tools.azure_blob import resolve_onboarding_doc_urls
from tools.azure_cosmos import get_compensation_band
from tools.compliance_validator import RCW_4962_W2_MIN, noncompete_allowed

logger = logging.getLogger(__name__)

FAQ_CHATBOT_URL = "https://hr.closedai.local/faq-chatbot"
TRAINING_PORTAL_URL = "https://learn.closedai.local/new-hire"

# In-process HITL cache: Execution must send THESE templates, not model-written copy.
_PACKETS: Dict[str, dict] = {}


def stash_packet(user_id: str, packet: dict) -> None:
    key = (user_id or "").strip()
    if key:
        _PACKETS[key] = packet
    email = str(packet.get("personal_email") or "").strip().lower()
    if email:
        _PACKETS[f"email:{email}"] = packet


def get_stashed_packet(user_id: str, email: str = "") -> Optional[dict]:
    uid = (user_id or "").strip()
    if uid and uid in _PACKETS:
        return _PACKETS[uid]
    em = (email or "").strip().lower()
    if em:
        return _PACKETS.get(f"email:{em}")
    if _PACKETS:
        return next(reversed(list(_PACKETS.values())))
    return None


def _benefits_text(assigned: List[dict], band_summary: str) -> str:
    bullets: List[str] = []
    for b in assigned:
        name = str(b.get("name") or "Benefit").strip()
        desc = str(b.get("description") or "").strip()
        bullets.append(f"- {name}: {desc}" if desc else f"- {name}")
    if band_summary:
        bullets.append(f"- Compensation-band benefits: {band_summary}")
    if not bullets:
        bullets.append(
            "- Medical and dental coverage, employer-sponsored retirement (401k) with match, "
            "and paid time off per company policy."
        )
    return "\n".join(bullets)


def _doc_url(docs: Dict[str, dict], key: str) -> str:
    rec = docs.get(key) or {}
    return str(rec.get("url") or "").strip()


def render_email_1_welcome(*, first: str, role: str, department: str, start_date: str) -> dict:
    subject = f"Welcome to ClosedAI, {first} — your first day"
    body = (
        f"Hi {first},\n\n"
        f"Welcome to ClosedAI! You are joining us as {role} in {department}, "
        f"with a start date of {start_date}.\n\n"
        "What to expect on Day 1:\n"
        "- Meet your manager and team for a short orientation\n"
        "- Receive your badge, laptop, and account credentials from IT\n"
        "- Walk through benefits enrollment and HR paperwork timelines\n\n"
        "Arrival info:\n"
        "- Dress code: business casual (comfortable shoes recommended)\n"
        "- Parking: visitor lot A; ask reception for a temporary pass\n"
        "- Please arrive by 9:00 AM and check in at the lobby\n\n"
        f"Questions before you start? Try our FAQ chatbot: {FAQ_CHATBOT_URL}\n\n"
        "We are excited to have you on the team.\n"
        "People Operations, ClosedAI\n"
    )
    return {"subject": subject, "body": body}


def render_email_2_action(
    *,
    first: str,
    docs: Dict[str, dict],
    include_nda: bool,
    benefits_text: str,
    compliance_reason: str,
) -> dict:
    subject = f"Action required: onboarding documents for {first}"
    i9 = _doc_url(docs, "i9")
    emergency = _doc_url(docs, "emergency")
    nda = _doc_url(docs, "nda")

    lines = [
        f"Hi {first},\n",
        "Please complete the following required documents before your start date.",
        "Each link is a time-bound Azure Blob SAS URL (Content-Disposition: inline).\n",
        "Required forms:",
        f"- Form I-9: {i9 or '(pending upload to Azure Blob Storage)'}",
        f"- Emergency Contact Form: {emergency or '(pending upload to Azure Blob Storage)'}",
    ]
    # RCW 49.62: NDA / non-compete only when salary meets threshold.
    if include_nda:
        lines.append(
            f"- Confidentiality / Non-Compete (employee_nda.pdf): "
            f"{nda or '(pending upload to Azure Blob Storage)'}"
        )
    else:
        lines.append(
            f"- NDA / non-compete omitted under Washington RCW 49.62 "
            f"(threshold ${RCW_4962_W2_MIN:,.2f} for W-2). {compliance_reason}"
        )

    lines.extend(
        [
            "\nYour assigned benefits summary:",
            benefits_text,
            "\nReply to this email if you need help completing any form.",
            "People Operations, ClosedAI\n",
        ]
    )
    return {"subject": subject, "body": "\n".join(lines)}


def render_email_3_roadmap(*, first: str, role: str, start_date: str) -> dict:
    subject = f"Your Week 1 roadmap — {first}"
    body = (
        f"Hi {first},\n\n"
        f"Here is your Week 1 roadmap as {role} (start date {start_date}).\n\n"
        f"Training portal: {TRAINING_PORTAL_URL}\n\n"
        "Week 1 checklist (placeholder):\n"
        "- [ ] Complete security awareness training\n"
        "- [ ] Finish benefits enrollment intro module\n"
        "- [ ] Meet your buddy / onboarding buddy sync\n"
        "- [ ] Review team wiki and tooling overview\n"
        "- [ ] Schedule 30-day check-in with your manager\n\n"
        "People Operations, ClosedAI\n"
    )
    return {"subject": subject, "body": body}


def render_it_tickets(
    *,
    employee_name: str,
    role: str,
    department: str,
    start_date: str,
    personal_email: str,
) -> str:
    return (
        "IT Provisioning Ticket — New Hire\n"
        "=================================\n"
        f"Name: {employee_name}\n"
        f"Role: {role}\n"
        f"Department: {department}\n"
        f"Start date: {start_date}\n"
        f"Personal email: {personal_email or '(not provided)'}\n\n"
        "1) Email / licenses setup\n"
        "   - Create corporate mailbox and Microsoft 365 license\n"
        "   - Assign Slack / Teams / SSO groups for the department\n\n"
        "2) Hardware order\n"
        "   - Laptop (standard engineering / office kit)\n"
        "   - Dual monitors + docking station\n"
        "   - Ship or stage for Day-1 pickup\n\n"
        "3) ID card generation\n"
        "   - Badge photo capture on Day 1\n"
        "   - Building access profile for department floor\n"
    )


def default_checklist_flags(*, nda_required: bool) -> dict:
    return {
        "background_check": False,
        "profile_setup": False,
        "email_setup": False,
        "i9_signed": False,
        "nda_signed": False if nda_required else None,
        "nda_required": nda_required,
        "emergency_contact": False,
        "training_checklist": False,
    }


def _as_salary(value: Any) -> int:
    if isinstance(value, bool):
        raise ValueError("salary must be a number")
    if isinstance(value, (int, float)):
        return int(value)
    text = str(value or "").replace(",", "").replace("$", "").strip()
    if not text:
        raise ValueError("salary is required")
    return int(float(text))


def _run_with_timeout(fn, timeout_s: float, default: Any) -> Any:
    """Avoid blocking the SSE thread forever on Azure SDK calls."""
    from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout

    pool = ThreadPoolExecutor(max_workers=1)
    try:
        return pool.submit(fn).result(timeout=timeout_s)
    except FuturesTimeout:
        logger.warning("Timed out after %ss: %s", timeout_s, getattr(fn, "__name__", fn))
        return default
    except Exception:
        logger.exception("Background Azure call failed")
        return default
    finally:
        pool.shutdown(wait=False, cancel_futures=True)


def prepare_onboarding_packet(
    first_name: str = "",
    last_name: str = "",
    personal_email: str = "",
    role: str = "",
    department: str = "",
    start_date: str = "",
    dob: str = "",
    salary: Any = None,
    employment_type: str = "W-2",
    **_extra: Any,
) -> dict:
    try:
        return _prepare_onboarding_packet_inner(
            first_name=first_name,
            last_name=last_name,
            personal_email=personal_email,
            role=role,
            department=department,
            start_date=start_date,
            dob=dob,
            salary=salary,
            employment_type=employment_type,
        )
    except Exception as e:
        logger.exception("prepare_onboarding_packet failed")
        return {"ok": False, "error": str(e)}


def _prepare_onboarding_packet_inner(
    first_name: str,
    last_name: str,
    personal_email: str,
    role: str,
    department: str,
    start_date: str,
    dob: str,
    salary: Any,
    employment_type: str,
) -> dict:
    first = str(first_name or "").strip()
    last = str(last_name or "").strip()
    email = str(personal_email or "").strip()
    role_val = str(role or "").strip()
    dept = str(department or "").strip()
    start = str(start_date or "").strip()
    emp_type = (employment_type or "W-2").strip() or "W-2"

    missing = []
    if not first:
        missing.append("First Name")
    if not last:
        missing.append("Last Name")
    if not role_val:
        missing.append("Role")
    if not dept:
        missing.append("Department")
    if not start:
        missing.append("Start Date")
    if salary is None or str(salary).strip() == "":
        missing.append("Salary")
    if missing:
        raise ValueError("Missing mandatory onboarding fields: " + ", ".join(missing))

    salary_n = _as_salary(salary)
    employee_name = f"{first} {last}".strip()

    employee_data = {
        "first_name": first,
        "last_name": last,
        "personal_email": email,
        "role": role_val,
        "department": dept,
        "start_date": start,
        "dob": dob,
        "salary": salary_n,
        "employment_type": emp_type,
    }
    assigned_benefits = evaluate_benefits(employee_data)
    band = _run_with_timeout(
        lambda: get_compensation_band(dept) if dept else {},
        8.0,
        {},
    )
    band_summary = ""
    if isinstance(band, dict) and not band.get("error"):
        band_summary = str(band.get("benefitsSummary") or band.get("benefits") or "").strip()

    # Explicit RCW 49.62 gate: W-2 NDA only if annual_salary >= 126858.83
    include_nda, compliance_reason = noncompete_allowed(salary_n, emp_type)
    docs = _run_with_timeout(
        lambda: resolve_onboarding_doc_urls(include_nda=include_nda),
        8.0,
        {},
    ) or {}

    benefits_text = _benefits_text(assigned_benefits, band_summary)
    email_1 = render_email_1_welcome(
        first=first, role=role_val, department=dept, start_date=start
    )
    email_2 = render_email_2_action(
        first=first,
        docs=docs,
        include_nda=include_nda,
        benefits_text=benefits_text,
        compliance_reason=compliance_reason,
    )
    email_3 = render_email_3_roadmap(first=first, role=role_val, start_date=start)
    it_tickets = render_it_tickets(
        employee_name=employee_name,
        role=role_val,
        department=dept,
        start_date=start,
        personal_email=email,
    )
    flags = default_checklist_flags(nda_required=include_nda)

    return {
        "ok": True,
        "employee_name": employee_name,
        "first_name": first,
        "last_name": last,
        "personal_email": email,
        "role": role_val,
        "department": dept,
        "start_date": start,
        "dob": dob,
        "salary": salary_n,
        "employment_type": emp_type,
        "assigned_benefits": assigned_benefits,
        "benefits_summary": band_summary,
        "email_1_welcome": email_1["body"],
        "email_1_subject": email_1["subject"],
        "email_2_action": email_2["body"],
        "email_2_subject": email_2["subject"],
        "email_3_roadmap": email_3["body"],
        "email_3_subject": email_3["subject"],
        "it_tickets": it_tickets,
        # Back-compat aliases used by older canvas / execution paths
        "drafted_teams_message": it_tickets,
        "onboarding_documents": docs,
        "include_nda": include_nda,
        "compliance": {"reason": compliance_reason, "include_nda": include_nda},
        "checklist_flags": flags,
        "status": "awaiting_approval",
    }
