"""Agent-facing bulk email draft helpers."""

from __future__ import annotations

from typing import Any, List, Optional

from services.bulk_email import draft_bulk_campaign


def _split_csv(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    text = str(value).strip()
    if not text:
        return []
    return [part.strip() for part in text.replace(";", ",").split(",") if part.strip()]


def compile_bulk_email(
    *,
    subject: str,
    body_template: str,
    department: str = "",
    employee_ids: Any = None,
    emails: Any = None,
    status: str = "active",
    search: str = "",
    title: str = "",
    user_id: str = "",
) -> dict:
    return draft_bulk_campaign(
        subject=subject,
        body_template=body_template,
        department=department,
        employee_ids=_split_csv(employee_ids),
        emails=_split_csv(emails),
        status=status,
        search=search,
        user_id=user_id,
        title=title,
    )
