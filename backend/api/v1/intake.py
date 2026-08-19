"""Intake queue API — list, read, and triage hr_tickets for the Intake page."""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from core.security.jwt_auth import verify_jwt
from tools.azure_cosmos import (
    TICKET_DISPOSITIONS,
    TICKET_STATUSES,
    get_hr_ticket,
    get_intake_overview,
    list_hr_tickets,
    update_hr_ticket,
)

router = APIRouter(prefix="/intake", tags=["intake"])

_ROUTE_TARGETS = {
    "hr-ops": "HR Operations",
    "payroll": "Payroll",
    "people-partner": "People Partner",
    "legal": "Legal & Compliance",
    "mobility": "Global Mobility",
}


class IntakeTicketPatch(BaseModel):
    action: Optional[str] = None  # route | group | close
    route_target: Optional[str] = None
    category: Optional[str] = None
    close_reason: Optional[str] = None
    note: Optional[str] = None
    status: Optional[str] = None
    disposition: Optional[str] = None
    employee_id: Optional[str] = None


def _ticket_to_intake(doc: dict) -> dict:
    """Shape Cosmos doc for the Intake UI (camelCase requester + derived state)."""
    status = str(doc.get("status") or "Open")
    handled = status == "Resolved"
    state = "handled" if handled else ("waiting" if status == "Pending" else "new")
    if not handled and doc.get("disposition") == "assist" and doc.get("suggested_response"):
        state = "triaged"
    name = str(doc.get("requester_name") or doc.get("employee_name") or "Unknown")
    initials = "".join(part[0].upper() for part in name.split()[:2] if part) or "??"
    return {
        "id": doc.get("id"),
        "subject": doc.get("subject") or doc.get("question") or "",
        "requester": {
            "name": name,
            "role": str(doc.get("requester_role") or ""),
            "initials": initials if name != "Withheld" else "··",
        },
        "channel": doc.get("channel") or "helpdesk",
        "category": doc.get("category") or "General",
        "topic": doc.get("category") or "General",
        "urgency": doc.get("urgency") or "normal",
        "due": doc.get("due") or "",
        "state": state,
        "disposition": doc.get("disposition") or "assist",
        "confidence": float(doc.get("confidence") or 0),
        "snippet": doc.get("snippet") or doc.get("question") or "",
        "suggestion": doc.get("suggestion") or "",
        "linkedWorkId": doc.get("linked_work_id") or None,
        "status": status,
        "priority": doc.get("priority"),
        "createdAt": doc.get("created_at"),
        "updatedAt": doc.get("updated_at"),
        "employeeId": doc.get("employeeId"),
        "employeeEmail": doc.get("employee_email"),
        "suggestedResponse": doc.get("suggested_response"),
        "policyReference": doc.get("policy_reference"),
        "routeTarget": doc.get("route_target"),
        "notes": doc.get("notes"),
    }


@router.get("/tickets")
async def get_intake_tickets(
    status: Optional[str] = Query(None),
    disposition: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=500),
    user: dict = Depends(verify_jwt),
):
    _ = user
    rows = list_hr_tickets(status=status, disposition=disposition, category=category, limit=limit)
    tickets = [_ticket_to_intake(r) for r in rows]
    overview = get_intake_overview(rows)
    categories = [
        {"id": cat.lower().replace(" ", "-").replace("&", "and"), "label": cat, "open": count}
        for cat, count in sorted(overview.get("by_category", {}).items(), key=lambda x: -x[1])
    ]
    return {"ok": True, "tickets": tickets, "overview": overview, "categories": categories}


@router.get("/tickets/{ticket_id}")
async def get_intake_ticket(ticket_id: str, user: dict = Depends(verify_jwt)):
    _ = user
    doc = get_hr_ticket(ticket_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return {"ok": True, "ticket": _ticket_to_intake(doc), "raw": doc}


@router.patch("/tickets/{ticket_id}")
async def patch_intake_ticket(
    ticket_id: str,
    body: IntakeTicketPatch,
    user: dict = Depends(verify_jwt),
):
    _ = user
    updates: Dict[str, Any] = {}
    note = (body.note or "").strip()

    if body.action == "route":
        target_label = _ROUTE_TARGETS.get(body.route_target or "", body.route_target or "HR Operations")
        updates["route_target"] = target_label
        updates["status"] = "Pending"
        if note:
            updates["notes"] = note
        elif body.route_target:
            updates["notes"] = f"Routed to {target_label}."
    elif body.action == "group":
        if body.category:
            updates["category"] = body.category
        if note:
            updates["notes"] = note
        elif body.category:
            updates["notes"] = f"Grouped into {body.category}."
    elif body.action == "close":
        updates["status"] = "Resolved"
        reason = body.close_reason or "resolved"
        updates["notes"] = note or f"Closed — {reason.replace('-', ' ')}."
    else:
        if body.status:
            if body.status not in TICKET_STATUSES:
                raise HTTPException(
                    status_code=400,
                    detail=f"status must be one of {list(TICKET_STATUSES)}",
                )
            updates["status"] = body.status
        if body.disposition:
            if body.disposition not in TICKET_DISPOSITIONS:
                raise HTTPException(
                    status_code=400,
                    detail=f"disposition must be one of {list(TICKET_DISPOSITIONS)}",
                )
            updates["disposition"] = body.disposition
        if body.category:
            updates["category"] = body.category
        if body.route_target:
            updates["route_target"] = _ROUTE_TARGETS.get(body.route_target, body.route_target)
        if note:
            updates["notes"] = note

    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")

    saved = update_hr_ticket(ticket_id, updates, employee_id=body.employee_id)
    if not saved:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return {"ok": True, "ticket": _ticket_to_intake(saved), "raw": saved}
