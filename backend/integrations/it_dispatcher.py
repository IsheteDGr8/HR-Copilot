"""IT ticket dispatch seam.

A separate team owns the real ticketing system. To avoid coupling to an
unfinished external dependency, the default provider is a MOCK sink that
generates a deterministic ticket id, logs the body, and records the ticket on
the employee's onboarding checklist. Swap in the real system (or Microsoft
Graph Teams Chat.Send) later by implementing the `teams`/HTTP branch — the
agent and UI call `dispatch_it_ticket(user_id, packet)` and never change.

Contract:
    dispatch_it_ticket(user_id, packet) -> {"ok", "ticket_id", "status", "mode"}
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


def _ticket_id(packet: dict) -> str:
    emp = (
        str(packet.get("employee_id") or packet.get("employeeId") or "")
        or (packet.get("personal_email") or "unknown").split("@")[0]
    )
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    return f"IT-{emp}-{stamp}".upper().replace(" ", "-")


def dispatch_it_ticket(user_id: str, packet: dict) -> dict:
    """Dispatch the drafted IT ticket. Mode is env-driven (`mock` default)."""
    mode = (os.getenv("IT_DISPATCH_MODE") or "mock").strip().lower()
    ticket_id = _ticket_id(packet)
    body = packet.get("it_tickets") or ""
    emp_id = str(packet.get("employee_id") or packet.get("employeeId") or "")

    if mode == "teams":
        # TODO(real): route to the external ticketing system or Microsoft Graph
        # Chat.Send. Example:
        #   from integrations.graph_tools import graph_post_chat_message
        #   chat_id = os.getenv("IT_TEAMS_CHAT_ID")
        #   res = graph_post_chat_message(user_id, chat_id, body)
        # Until then, fall through to the mock so provisioning never blocks.
        logger.warning("IT_DISPATCH_MODE=teams not implemented; using mock sink.")

    logger.info("MOCK IT ticket %s dispatched for user_id=%s\n%s", ticket_id, user_id, body)
    try:
        from tools.azure_cosmos import set_checklist_it_ticket

        set_checklist_it_ticket(emp_id, ticket_id=ticket_id, status="submitted")
    except Exception:
        logger.debug("Could not persist mock IT ticket on checklist", exc_info=True)

    return {"ok": True, "ticket_id": ticket_id, "status": "submitted", "mode": "mock"}
