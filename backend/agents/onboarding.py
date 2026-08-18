"""Onboarding worker — collects fields, then Python builds the packet. No writes."""

from __future__ import annotations

import json
import logging
from typing import Any, AsyncGenerator, Dict, List, Optional

from agents.runtime import MAX_TOOL_ITERATIONS, llm_complete, sse
from tools.onboarding_tools import prepare_onboarding_packet, stash_packet

logger = logging.getLogger(__name__)

SYSTEM = """You are the Onboarding Agent.
Before you can call the compile_onboarding_packet tool, you MUST collect the following
mandatory fields from the user: First Name, Last Name, Role, Department, Salary, and Start Date.
If any of these are missing, DO NOT call the tool. Ask the user a direct question to gather
the missing information.

Optional (ask if easy, but do not block): personal email, date of birth, employment type (W-2 vs contractor).

You have exactly one tool: compile_onboarding_packet.
You do NOT have send_email, commit_new_hire_to_db, or any other mutating tool. Never claim you sent mail.
Do not write a welcome email. Do not invent document links. Python generates the Side Canvas packet.
"""

COMPILE_TOOL = {
    "type": "function",
    "function": {
        "name": "compile_onboarding_packet",
        "description": (
            "Build the deterministic onboarding packet for Side Canvas review. "
            "Call only after First Name, Last Name, Role, Department, Salary, and Start Date are known. "
            "Not a send."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "first_name": {"type": "string"},
                "last_name": {"type": "string"},
                "personal_email": {"type": "string"},
                "role": {"type": "string"},
                "department": {"type": "string"},
                "start_date": {"type": "string"},
                "dob": {"type": "string"},
                "salary": {"type": ["integer", "string", "number"]},
                "employment_type": {"type": "string"},
            },
            "required": [
                "first_name",
                "last_name",
                "role",
                "department",
                "start_date",
                "salary",
            ],
        },
    },
}

MUTATING_TOOLS = frozenset(
    {"send_email", "commit_new_hire_to_db", "send_graph_mail", "post_teams_message"}
)

CLOSING_DELTA = (
    "I have compiled the onboarding packet. Please review it in the Side Canvas and confirm."
)


def _canvas_payload(packet: dict) -> dict:
    """Pass the multi-email packet to Side Canvas (no HTML variants)."""
    return dict(packet)


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

    for iteration in range(1, MAX_TOOL_ITERATIONS + 1):
        logger.info("Onboarding LLM iteration %s/%s", iteration, MAX_TOOL_ITERATIONS)
        try:
            response = await llm_complete(messages, tools=[COMPILE_TOOL], stream=False)
        except Exception as exc:
            logger.exception("Onboarding LLM call failed")
            yield sse("delta", data=f"I could not reach the model: {exc}")
            return

        msg = response.choices[0].message
        tool_calls = getattr(msg, "tool_calls", None) or []
        if not tool_calls:
            text = (
                getattr(msg, "content", None)
                or "I still need First Name, Last Name, Role, Department, Salary, and Start Date."
            )
            yield sse("delta", data=text)
            return

        for tc in tool_calls:
            name = tc.function.name
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError as exc:
                logger.warning("Onboarding tool args were not valid JSON: %s", exc)
                args = {}
            logger.info("Onboarding tool call attempt: %s args=%s", name, args)
            yield sse("tool_start", tool=name, args=args)

            if name in MUTATING_TOOLS or name != "compile_onboarding_packet":
                err = f"blocked or unknown tool: {name}"
                logger.warning(err)
                yield sse("tool_end", tool=name, error=err)
                yield sse("delta", data=err)
                return

            packet = prepare_onboarding_packet(**args if isinstance(args, dict) else {})
            if not packet.get("ok"):
                err = str(packet.get("error") or packet)
                logger.warning("compile_onboarding_packet error: %s", err)
                yield sse("tool_end", tool=name, error=err)
                messages.append(
                    {
                        "role": "assistant",
                        "content": "",
                        "tool_calls": [
                            {
                                "id": getattr(tc, "id", "call_1"),
                                "type": "function",
                                "function": {
                                    "name": name,
                                    "arguments": tc.function.arguments or "{}",
                                },
                            }
                        ],
                    }
                )
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": getattr(tc, "id", "call_1"),
                        "content": json.dumps({"error": err}),
                    }
                )
                if iteration == MAX_TOOL_ITERATIONS:
                    yield sse(
                        "delta",
                        data=(
                            "I could not compile the packet: "
                            f"{err}. Please send First Name, Last Name, Role, "
                            "Department, Salary, and Start Date."
                        ),
                    )
                    return
                break

            stash_packet(user_id, packet)
            yield sse("tool_end", tool=name, result={"ok": True, "status": "awaiting_approval"})
            yield sse(
                "canvas_update",
                data={"view": "ONBOARDING_WORKFLOW", "data": _canvas_payload(packet)},
            )
            yield sse("delta", data=CLOSING_DELTA)
            return
    else:
        yield sse(
            "delta",
            data=(
                "I still need First Name, Last Name, Role, Department, Salary, and Start Date "
                "before I can compile the packet."
            ),
        )
