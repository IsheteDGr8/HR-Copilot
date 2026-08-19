"""Bulk email campaigns — resolve recipients, personalize, draft, and send."""

from __future__ import annotations

import re
import time
import uuid
from typing import Any, Dict, List, Optional

from integrations.gmail_tools import gmail_send
from services.database import list_employees

# Per-user stashed campaigns awaiting HITL approval (mirrors helpdesk/onboarding stash).
_CAMPAIGNS: Dict[str, dict] = {}

_TOKEN_RE = re.compile(r"\{\{\s*([a-z_]+)\s*\}\}", re.IGNORECASE)

DEFAULT_SEND_DELAY_SEC = 0.35
MAX_RECIPIENTS = 500


def stash_bulk_campaign(user_id: str, campaign: dict) -> None:
    key = (user_id or "").strip()
    if key:
        _CAMPAIGNS[key] = campaign


def get_stashed_bulk_campaign(user_id: str) -> Optional[dict]:
    uid = (user_id or "").strip()
    if uid and uid in _CAMPAIGNS:
        return _CAMPAIGNS[uid]
    if _CAMPAIGNS:
        return next(reversed(list(_CAMPAIGNS.values())))
    return None


def clear_bulk_campaign(user_id: str) -> None:
    _CAMPAIGNS.pop((user_id or "").strip(), None)


def _employee_email(emp: dict) -> str:
    return str(emp.get("email") or emp.get("personal_email") or "").strip()


def _employee_first_name(emp: dict) -> str:
    first = str(emp.get("first_name") or "").strip()
    if first:
        return first
    name = str(emp.get("name") or emp.get("employee_name") or "").strip()
    return name.split()[0] if name else "there"


def _employee_display_name(emp: dict) -> str:
    return str(
        emp.get("name")
        or emp.get("employee_name")
        or f"{emp.get('first_name', '')} {emp.get('last_name', '')}".strip()
        or "Employee"
    )


def personalize(template: str, employee: dict) -> str:
    """Replace {{first_name}}, {{name}}, {{email}}, {{department}}, {{role}} tokens."""
    text = template or ""

    def repl(match: re.Match) -> str:
        key = (match.group(1) or "").lower()
        if key in ("first_name", "firstname"):
            return _employee_first_name(employee)
        if key in ("last_name", "lastname"):
            parts = _employee_display_name(employee).split()
            return parts[-1] if len(parts) > 1 else ""
        if key == "name":
            return _employee_display_name(employee)
        if key == "email":
            return _employee_email(employee)
        if key == "department":
            return str(employee.get("department") or "")
        if key in ("role", "title"):
            return str(employee.get("role") or employee.get("title") or "")
        if key in ("employee_id", "id"):
            return str(employee.get("employeeId") or employee.get("id") or "")
        return match.group(0)

    return _TOKEN_RE.sub(repl, text)


def resolve_recipients(
    *,
    department: str = "",
    employee_ids: Optional[List[str]] = None,
    emails: Optional[List[str]] = None,
    status: str = "active",
    search: str = "",
    limit: int = MAX_RECIPIENTS,
) -> List[dict]:
    """Return employee dicts with valid email addresses."""
    rows = list_employees(
        department=department or None,
        employee_ids=employee_ids,
        emails=emails,
        status=status or None,
        search=search or None,
        limit=limit,
        _internal=True,
    )
    if isinstance(rows, dict) and rows.get("error"):
        return []
    out: List[dict] = []
    seen_emails: set[str] = set()
    for emp in rows:
        if not isinstance(emp, dict):
            continue
        email = _employee_email(emp).lower()
        if not email or email in seen_emails:
            continue
        seen_emails.add(email)
        out.append(emp)
    return out


def draft_bulk_campaign(
    *,
    subject: str,
    body_template: str,
    department: str = "",
    employee_ids: Optional[List[str]] = None,
    emails: Optional[List[str]] = None,
    status: str = "active",
    search: str = "",
    user_id: str = "",
    title: str = "",
) -> dict:
    """Build a bulk campaign draft for Side Canvas review."""
    subj = (subject or "").strip()
    template = (body_template or "").strip()
    if not subj:
        return {"ok": False, "error": "subject is required."}
    if not template:
        return {"ok": False, "error": "body_template is required."}

    recipients = resolve_recipients(
        department=department,
        employee_ids=employee_ids,
        emails=emails,
        status=status,
        search=search,
    )
    if not recipients:
        return {
            "ok": False,
            "error": (
                "No employees with email addresses matched that audience. "
                "Try department, employee_ids, or emails."
            ),
        }

    campaign_id = f"bulk-{uuid.uuid4().hex[:10]}"
    messages = []
    for emp in recipients:
        email = _employee_email(emp)
        messages.append(
            {
                "employee_id": str(emp.get("employeeId") or emp.get("id") or ""),
                "name": _employee_display_name(emp),
                "email": email,
                "department": str(emp.get("department") or ""),
                "role": str(emp.get("role") or ""),
                "subject": subj,
                "body": personalize(template, emp),
            }
        )

    campaign = {
        "ok": True,
        "status": "awaiting_approval",
        "campaign_id": campaign_id,
        "title": title or subj,
        "subject": subj,
        "body_template": template,
        "audience": {
            "department": department or None,
            "employee_ids": employee_ids or [],
            "emails": emails or [],
            "status": status or "active",
            "search": search or None,
        },
        "recipient_count": len(messages),
        "recipients_preview": messages[:8],
        "messages": messages,
        "personalization_tokens": ["{{first_name}}", "{{name}}", "{{email}}", "{{department}}", "{{role}}"],
    }
    stash_bulk_campaign(user_id, campaign)
    return campaign


def send_bulk_campaign(
    campaign: dict,
    user_id: str = "",
    *,
    subject_override: str = "",
    body_template_override: str = "",
    send_delay_sec: float = DEFAULT_SEND_DELAY_SEC,
) -> dict:
    """Send all messages in a campaign via Gmail. Returns per-recipient results."""
    if not campaign or not campaign.get("ok"):
        return {"ok": False, "error": "Invalid bulk campaign."}

    subj = (subject_override or campaign.get("subject") or "").strip()
    template = (body_template_override or campaign.get("body_template") or "").strip()
    messages: List[dict] = list(campaign.get("messages") or [])

    if template and template != campaign.get("body_template"):
        # Re-personalize if the approver edited the template.
        refreshed = []
        for row in messages:
            emp = {
                "first_name": row.get("name", "").split()[0] if row.get("name") else "",
                "name": row.get("name"),
                "email": row.get("email"),
                "department": row.get("department"),
                "role": row.get("role"),
                "employeeId": row.get("employee_id"),
            }
            refreshed.append(
                {
                    **row,
                    "subject": subj,
                    "body": personalize(template, emp),
                }
            )
        messages = refreshed

    if not messages:
        return {"ok": False, "error": "Campaign has no recipients."}

    sent: List[dict] = []
    failed: List[dict] = []
    for i, row in enumerate(messages):
        to = str(row.get("email") or "").strip()
        body = str(row.get("body") or "").strip()
        if not to:
            failed.append({**row, "error": "missing email"})
            continue
        try:
            result = gmail_send(to=to, subject=subj, body=body, user_id=user_id)
            sent.append({**row, "gmail_id": result.get("id"), "ok": True})
        except Exception as exc:
            failed.append({**row, "error": str(exc)})
        if send_delay_sec > 0 and i < len(messages) - 1:
            time.sleep(send_delay_sec)

    clear_bulk_campaign(user_id)
    return {
        "ok": len(failed) == 0,
        "campaign_id": campaign.get("campaign_id"),
        "sent_count": len(sent),
        "failed_count": len(failed),
        "total": len(messages),
        "sent": sent[:20],
        "failed": failed[:20],
        "summary": f"Sent {len(sent)}/{len(messages)} emails."
        + (f" {len(failed)} failed." if failed else ""),
    }
