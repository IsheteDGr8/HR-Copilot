"""Inbound webhooks for external document/ticket state changes.

These endpoints are NOT JWT-protected (they are called by external systems).
They are guarded by a shared-secret header instead: X-Webhook-Token.
"""

from __future__ import annotations

import logging
import os

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from tools.azure_cosmos import set_checklist_it_ticket, update_onboarding_checklist

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

# Map an external document type to the checklist boolean flag it satisfies.
_DOC_TYPE_TO_FLAG = {
    "i9": "i9_signed",
    "i-9": "i9_signed",
    "nda": "nda_signed",
    "non_compete": "nda_signed",
    "emergency": "emergency_contact",
    "emergency_contact": "emergency_contact",
}


def _verify_secret(token: str | None) -> None:
    expected = (os.getenv("WEBHOOK_SHARED_SECRET") or "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="Webhooks disabled: WEBHOOK_SHARED_SECRET unset")
    if (token or "").strip() != expected:
        raise HTTPException(status_code=401, detail="Invalid webhook token")


class DocumentSignedPayload(BaseModel):
    employee_id: str
    document_type: str


@router.post("/document-signed")
async def document_signed(
    payload: DocumentSignedPayload,
    x_webhook_token: str | None = Header(None),
):
    """Catch a 'document signed' event from an e-signature platform / Blob trigger."""
    _verify_secret(x_webhook_token)
    flag = _DOC_TYPE_TO_FLAG.get((payload.document_type or "").strip().lower())
    if not flag:
        raise HTTPException(status_code=400, detail=f"Unknown document_type: {payload.document_type}")
    doc = update_onboarding_checklist(payload.employee_id, {flag: True})
    if not doc:
        raise HTTPException(status_code=404, detail="Checklist not found")
    logger.info("Webhook flipped %s=true for employee_id=%s", flag, payload.employee_id)
    return {"ok": True, "flag": flag, "status": doc.get("status")}


class ItTicketAckPayload(BaseModel):
    employee_id: str
    ticket_id: str | None = None
    status: str = "complete"


@router.post("/it-ticket-ack")
async def it_ticket_ack(
    payload: ItTicketAckPayload,
    x_webhook_token: str | None = Header(None),
):
    """Mock IT 'ticket closed' callback: flip provisioning flags + record status."""
    _verify_secret(x_webhook_token)
    if (payload.status or "").strip().lower() != "complete":
        # Only a completion flips the checklist; record status otherwise.
        set_checklist_it_ticket(payload.employee_id, ticket_id=payload.ticket_id or "", status=payload.status)
        return {"ok": True, "status": payload.status}
    doc = update_onboarding_checklist(
        payload.employee_id, {"profile_setup": True, "email_setup": True}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Checklist not found")
    if payload.ticket_id:
        set_checklist_it_ticket(payload.employee_id, ticket_id=payload.ticket_id, status="complete")
    logger.info("IT ticket ack completed provisioning for employee_id=%s", payload.employee_id)
    return {"ok": True, "flags": ["profile_setup", "email_setup"], "status": doc.get("status")}
