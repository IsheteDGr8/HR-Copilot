"""Helpdesk ticket read/patch API for TicketResolver."""

from __future__ import annotations

from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.security.jwt_auth import verify_jwt
from tools.azure_cosmos import TICKET_PRIORITIES, TICKET_STATUSES, get_hr_ticket, update_hr_ticket
from tools.helpdesk_tools import get_stashed_ticket, stash_ticket

router = APIRouter(prefix="/helpdesk", tags=["helpdesk"])


class TicketPatch(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    suggested_response: Optional[str] = None
    employee_id: Optional[str] = None
    notes: Optional[str] = None


@router.get("/tickets/{ticket_id}")
async def read_ticket(ticket_id: str, user: dict = Depends(verify_jwt)):
    doc = get_hr_ticket(ticket_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return doc


@router.patch("/tickets/{ticket_id}")
async def patch_ticket(
    ticket_id: str,
    body: TicketPatch,
    user: dict = Depends(verify_jwt),
):
    updates: Dict[str, str] = {}
    if body.status:
        if body.status not in TICKET_STATUSES:
            raise HTTPException(status_code=400, detail=f"status must be one of {list(TICKET_STATUSES)}")
        updates["status"] = body.status
    if body.priority:
        if body.priority not in TICKET_PRIORITIES:
            raise HTTPException(status_code=400, detail=f"priority must be one of {list(TICKET_PRIORITIES)}")
        updates["priority"] = body.priority
    if body.suggested_response is not None:
        updates["suggested_response"] = body.suggested_response
    if body.notes is not None:
        updates["notes"] = body.notes
    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")

    saved = update_hr_ticket(ticket_id, updates, employee_id=body.employee_id)
    if not saved:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # Keep the in-memory stash in sync so [APPROVED TO SEND] uses the edited body.
    stashed = get_stashed_ticket(str(user.get("user_id") or ""))
    if stashed and str(stashed.get("ticket_id") or "") == ticket_id:
        stashed = {**stashed, **updates, "drafted_response": saved.get("suggested_response")}
        stash_ticket(str(user.get("user_id") or ""), stashed)

    return saved
