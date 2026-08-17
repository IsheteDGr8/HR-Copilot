"""Lifecycle worker — transfers, leave, profile updates (draft only)."""

from __future__ import annotations

import json
from typing import Any, AsyncGenerator, Dict, List, Optional

from agents.runtime import llm_complete, sse
from tools.azure_cosmos import lookup_employee
from tools.lifecycle_tools import compile_transfer_packet, stash_transfer

SYSTEM = """You are the Lifecycle worker (transfers, leave, employment changes).
Use lookup_employee_record to read a record. For an internal transfer or promotion,
call compile_transfer_packet with the employee and the target department, manager, and/or
salary. NEVER write changes yourself. After drafting, tell the user to confirm in chat with
[UPDATE APPROVED] so the Execution agent applies the change.
"""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "lookup_employee_record",
            "description": "Read an employee record from Cosmos by name or email.",
            "parameters": {
                "type": "object",
                "properties": {"search_term": {"type": "string"}},
                "required": ["search_term"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compile_transfer_packet",
            "description": (
                "Draft an internal transfer/promotion packet: computes compensation deltas, "
                "re-checks RCW 49.62 non-compete thresholds, and drafts a transfer memo."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "employee_query": {"type": "string", "description": "Name or email of the employee."},
                    "new_department": {"type": "string"},
                    "new_manager_id": {"type": "string"},
                    "new_salary": {"type": "number"},
                    "effective_date": {"type": "string"},
                    "employment_type": {"type": "string"},
                },
                "required": ["employee_query"],
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
        yield sse("delta", data=getattr(msg, "content", None) or "Which employee should I look up?")
        return

    for tc in tool_calls:
        name = tc.function.name
        args = json.loads(tc.function.arguments or "{}")
        yield sse("tool_start", tool=name, args=args)

        if name == "compile_transfer_packet":
            packet = compile_transfer_packet(**args if isinstance(args, dict) else {})
            if not packet.get("ok"):
                yield sse("tool_end", tool=name, error=packet.get("error"))
                yield sse("delta", data=f"I couldn't draft the transfer: {packet.get('error')}")
                return
            stash_transfer(user_id, packet)
            yield sse("tool_end", tool=name, result={"ok": True, "status": "awaiting_approval"})
            yield sse("canvas_update", data={"view": "LIFECYCLE_TRANSFER", "data": packet})
            note = (
                "Transfer packet is ready in the Side Canvas. Review the compensation delta"
                + (" and the required NDA/non-compete addendum" if packet.get("nda_addendum_required") else "")
                + ", then reply [UPDATE APPROVED] to apply it."
            )
            yield sse("delta", data=note)
            return

        # Default: read-only lookup.
        result = lookup_employee(args.get("search_term") or args.get("employee_query") or "")
        yield sse("tool_end", tool=name, result=result)
        yield sse(
            "delta",
            data=(
                "Here is the current record (read-only). To change it, tell me the target "
                "department/manager/salary and I'll draft a transfer packet.\n"
                f"{json.dumps(result, default=str)[:3500]}"
            ),
        )
        return
