"""Helpdesk worker — policy-backed ticket drafts for HITL resolution."""

from __future__ import annotations

import json
from typing import Any, AsyncGenerator, Dict, List, Optional

from agents.runtime import llm_complete, sse
from tools.azure_cosmos import get_hr_ticket, list_hr_tickets
from tools.helpdesk_tools import compile_helpdesk_ticket, stash_ticket
from tools.bulk_email_tools import compile_bulk_email

SYSTEM = """You are the HR Helpdesk worker.
When an employee (or HR rep on their behalf) asks a policy / benefits / PTO / workplace
question, you MUST call compile_helpdesk_ticket with the employee's exact question
(and employee identity if known).

Never answer general knowledge, celebrities, or public-figure questions — only HR policies,
connected systems, and employee records via tools.

When HR asks to email many employees (a department, all staff, or a list), call
draft_bulk_email with subject and body_template. Use {{first_name}} or {{name}} for
personalization. NEVER send directly — the Side Canvas shows the recipient list for approval.

When HR asks about the intake queue ("what's in intake", "summarize urgent tickets",
"show open helpdesk tickets"), call list_intake_tickets with optional filters.

To act on a specific ticket, call open_intake_ticket with its ticket_id — the Side Canvas
opens the ticket for review and approval.

The tool runs search_corporate_policies(question) against corporate policy PDFs /
Azure AI Search and injects the retrieved text into policy_reference. The drafted
employee email MUST cite that policy_reference snippet — never invent policy text.

After the tool returns, the Side Canvas shows the ticket. Keep chat text minimal.
You do NOT send email yourself — Execution sends only after [APPROVED TO SEND].
"""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "list_intake_tickets",
            "description": (
                "List open HR intake / helpdesk tickets from Cosmos. "
                "Use for queue summaries, urgent triage, or category counts."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "description": "Optional filter: Open, Pending, or Resolved.",
                    },
                    "disposition": {
                        "type": "string",
                        "description": "Optional filter: auto, assist, or human.",
                    },
                    "category": {"type": "string", "description": "Optional category filter."},
                    "limit": {"type": "integer", "description": "Max rows (default 20)."},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "open_intake_ticket",
            "description": "Open an existing intake ticket in the Side Canvas for review or action.",
            "parameters": {
                "type": "object",
                "properties": {
                    "ticket_id": {"type": "string", "description": "Ticket id, e.g. tkt-in-8841."},
                },
                "required": ["ticket_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compile_helpdesk_ticket",
            "description": (
                "Search corporate policies via search_corporate_policies(question), "
                "create an Open helpdesk ticket with category, priority, policy_reference, "
                "and a drafted employee response that cites the retrieved policy snippet."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "question": {"type": "string"},
                    "employee_query": {
                        "type": "string",
                        "description": "Employee name or email to look up (optional).",
                    },
                    "employee_id": {"type": "string"},
                    "employee_name": {"type": "string"},
                    "employee_email": {"type": "string"},
                    "category": {"type": "string"},
                    "priority": {"type": "string"},
                },
                "required": ["question"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "draft_bulk_email",
            "description": (
                "Draft a bulk email to many employees (by department, ids, or email list). "
                "Opens the Side Canvas for review before any send."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "subject": {"type": "string"},
                    "body_template": {"type": "string"},
                    "department": {"type": "string", "description": "e.g. Engineering, HR"},
                    "employee_ids": {"type": "string", "description": "Comma-separated emp ids"},
                    "emails": {"type": "string", "description": "Comma-separated emails"},
                    "status": {"type": "string", "description": "active (default)"},
                    "search": {"type": "string"},
                    "title": {"type": "string"},
                },
                "required": ["subject", "body_template"],
            },
        },
    },
]


def _ticket_to_canvas_packet(doc: dict) -> dict:
    return {
        "ok": True,
        "status": "awaiting_approval",
        "ticket_id": doc.get("id"),
        "employee_id": doc.get("employeeId"),
        "employee_name": doc.get("employee_name") or doc.get("requester_name"),
        "employee_email": doc.get("employee_email"),
        "ticket_category": doc.get("category"),
        "priority_level": doc.get("priority"),
        "question": doc.get("question") or doc.get("snippet"),
        "ai_summary": doc.get("suggestion") or doc.get("subject"),
        "policy_reference": doc.get("policy_reference") or "",
        "drafted_response": doc.get("suggested_response") or "",
        "suggested_response": doc.get("suggested_response") or "",
        "disposition": doc.get("disposition"),
        "confidence": doc.get("confidence"),
        "channel": doc.get("channel"),
        "subject": doc.get("subject"),
    }


async def run(
    prompt: str,
    history: Optional[List[Dict[str, Any]]] = None,
    user_id: str = "",
) -> AsyncGenerator[str, None]:
    messages: List[Dict[str, Any]] = [
        {"role": "system", "content": SYSTEM},
        *(history or []),
        {"role": "user", "content": prompt},
    ]
    response = await llm_complete(messages, tools=TOOLS, stream=False)
    msg = response.choices[0].message
    tool_calls = getattr(msg, "tool_calls", None) or []

    if not tool_calls:
        pl = (prompt or "").lower()
        if any(k in pl for k in ("intake", "open tickets", "helpdesk queue", "what's waiting")):
            rows = list_hr_tickets(limit=15)
            open_rows = [r for r in rows if r.get("status") != "Resolved"][:10]
            if not open_rows:
                yield sse("delta", data="No open intake tickets right now.")
                return
            lines = [
                f"- {r.get('id')}: {r.get('subject')} ({r.get('disposition')}, {r.get('urgency')})"
                for r in open_rows
            ]
            yield sse("delta", data="Open intake tickets:\n" + "\n".join(lines))
            return
        packet = compile_helpdesk_ticket(prompt)
        if packet.get("ok"):
            stash_ticket(user_id, packet)
            yield sse("canvas_update", data={"view": "HELPDESK_TICKET", "data": packet})
            yield sse(
                "delta",
                data=(
                    "Helpdesk ticket drafted in the Side Canvas. Review the policy context "
                    "and response, then Approve & Send, Ask for Info, or Escalate."
                ),
            )
        else:
            yield sse(
                "delta",
                data=getattr(msg, "content", None)
                or packet.get("error")
                or "What is the employee's HR question?",
            )
        return

    for tc in tool_calls:
        name = tc.function.name
        args = json.loads(tc.function.arguments or "{}")
        yield sse("tool_start", tool=name, args=args)

        if name == "list_intake_tickets":
            rows = list_hr_tickets(
                status=args.get("status") or None,
                disposition=args.get("disposition") or None,
                category=args.get("category") or None,
                limit=int(args.get("limit") or 20),
            )
            open_rows = [r for r in rows if r.get("status") != "Resolved"]
            yield sse("tool_end", tool=name, result={"count": len(open_rows)})
            if not open_rows:
                yield sse("delta", data="No matching intake tickets.")
                return
            lines = [
                f"- {r.get('id')}: {r.get('subject')} · {r.get('category')} · "
                f"{r.get('disposition')} · {r.get('urgency')}"
                for r in open_rows[:15]
            ]
            yield sse(
                "delta",
                data=f"{len(open_rows)} ticket(s) in intake:\n" + "\n".join(lines),
            )
            return

        if name == "open_intake_ticket":
            tid = str(args.get("ticket_id") or "").strip()
            doc = get_hr_ticket(tid) if tid else None
            if not doc:
                yield sse("tool_end", tool=name, error="ticket not found")
                yield sse("delta", data=f"Could not find ticket {tid!r}.")
                return
            packet = _ticket_to_canvas_packet(doc)
            stash_ticket(user_id, packet)
            yield sse("tool_end", tool=name, result={"ok": True, "ticket_id": tid})
            yield sse("canvas_update", data={"view": "HELPDESK_TICKET", "data": packet})
            yield sse(
                "delta",
                data=f"Opened {tid} in the Side Canvas — review and approve when ready.",
            )
            return

        if name != "compile_helpdesk_ticket":
            if name == "draft_bulk_email":
                packet = compile_bulk_email(
                    user_id=user_id,
                    **{k: args[k] for k in args if k in (
                        "subject", "body_template", "department", "employee_ids",
                        "emails", "status", "search", "title",
                    )},
                )
                if not packet.get("ok"):
                    yield sse("tool_end", tool=name, error=packet.get("error"))
                    yield sse("delta", data=packet.get("error") or "Could not draft bulk email.")
                    return
                yield sse("tool_end", tool=name, result={"ok": True, "recipient_count": packet.get("recipient_count")})
                yield sse("canvas_update", data={"view": "BULK_EMAIL", "data": packet})
                yield sse(
                    "delta",
                    data=(
                        f"Bulk email draft ready for {packet.get('recipient_count')} employees "
                        f"— review recipients and message in the Side Canvas, then Approve & Send."
                    ),
                )
                return
            yield sse("tool_end", tool=name, error="unknown tool")
            continue
        packet = compile_helpdesk_ticket(**{k: args[k] for k in args if k in (
            "question",
            "employee_query",
            "employee_id",
            "employee_name",
            "employee_email",
            "category",
            "priority",
        )})
        if not packet.get("ok"):
            yield sse("tool_end", tool=name, error=packet.get("error"))
            yield sse("delta", data=packet.get("error") or "Could not open a helpdesk ticket.")
            return
        stash_ticket(user_id, packet)
        yield sse("tool_end", tool=name, result={"ok": True, "ticket_id": packet.get("ticket_id")})
        yield sse("canvas_update", data={"view": "HELPDESK_TICKET", "data": packet})
        yield sse(
            "delta",
            data=(
                f"Opened helpdesk ticket {packet.get('ticket_id')} "
                f"({packet.get('ticket_category')}, {packet.get('priority_level')}). "
                "Review it in the Side Canvas."
            ),
        )
        return
