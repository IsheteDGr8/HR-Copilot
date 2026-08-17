"""Helpdesk worker — policy-backed ticket drafts for HITL resolution."""

from __future__ import annotations

import json
from typing import Any, AsyncGenerator, Dict, List, Optional

from agents.runtime import llm_complete, sse
from tools.helpdesk_tools import compile_helpdesk_ticket, stash_ticket

SYSTEM = """You are the HR Helpdesk worker.
When an employee (or HR rep on their behalf) asks a policy / benefits / PTO / workplace
question, you MUST call compile_helpdesk_ticket with the employee's exact question
(and employee identity if known).

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
]


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
        # Deterministic fallback: treat the whole prompt as the question.
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
        if name != "compile_helpdesk_ticket":
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
