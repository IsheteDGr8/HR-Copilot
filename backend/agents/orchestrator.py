"""Supervisor / semantic router. Does not mutate state."""

from __future__ import annotations

import logging
from typing import Any, AsyncGenerator, Dict, List, Optional

from agents import execution, helpdesk, it_provisioning, lifecycle, onboarding, recruiting
from agents.runtime import has_approval_tag, llm_complete, sse, stream_text

logger = logging.getLogger(__name__)

ORCH_SYSTEM = """You are the HR Copilot Orchestrator. You do not execute writes or send email.
You have no send_email or commit_new_hire_to_db tools.
Classify the user request and call exactly one transfer tool:
- transfer_to_onboarding: new hires, I-9, NDA, welcome packets, start dates
- transfer_to_recruiting: job postings, JDs, salary ranges, screening, applicants
- transfer_to_lifecycle: transfers, leave, title/comp changes, employee lookups
- transfer_to_it_provisioning: laptops, SSO, Teams access tickets
- transfer_to_helpdesk: employee HR questions, PTO/benefits/policy helpdesk tickets
If the user is only chatting (greetings), do not call a tool — answer briefly and stay in HR scope.
Never call execution tools yourself. Never send email.
"""

TRANSFER_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": name,
            "description": desc,
            "parameters": {"type": "object", "properties": {}},
        },
    }
    for name, desc in [
        ("transfer_to_onboarding", "Delegate to the Onboarding worker."),
        ("transfer_to_recruiting", "Delegate to the Recruiting worker."),
        ("transfer_to_lifecycle", "Delegate to the Lifecycle worker."),
        ("transfer_to_it_provisioning", "Delegate to the IT Provisioning worker."),
        ("transfer_to_helpdesk", "Delegate to the HR Helpdesk worker."),
    ]
]

KEYWORD_ROUTES = (
    ("onboarding", ("onboard", "new hire", "i-9", "i9", "nda", "welcome packet", "start date")),
    (
        "recruiting",
        (
            "job posting",
            "job description",
            "jd ",
            "salary range",
            "compensation band",
            "screen candidate",
            "screen resume",
            "recruit",
            "hiring",
            "hire for",
            "applicant",
            "shortlist",
        ),
    ),
    ("lifecycle", ("transfer", "leave request", "pto for", "promotion", "look up", "lookup", "employee record")),
    ("it_provisioning", ("laptop", "provision", "sso", "teams ticket", "servicenow")),
    (
        "helpdesk",
        (
            "helpdesk",
            "hr ticket",
            "policy question",
            "pto policy",
            "benefits question",
            "how many vacation",
            "employee asked",
            "open a ticket",
        ),
    ),
)


def _keyword_route(prompt: str) -> Optional[str]:
    p = (prompt or "").lower()
    for agent, keys in KEYWORD_ROUTES:
        if any(k in p for k in keys):
            return agent
    return None


async def _choose_worker(prompt: str, history: Optional[List[Dict[str, Any]]]) -> str:
    keyed = _keyword_route(prompt)
    if keyed:
        return keyed
    messages = [
        {"role": "system", "content": ORCH_SYSTEM},
        *(history or [])[-8:],
        {"role": "user", "content": prompt},
    ]
    try:
        response = await llm_complete(messages, tools=TRANSFER_TOOLS, stream=False)
        msg = response.choices[0].message
        calls = getattr(msg, "tool_calls", None) or []
        if calls:
            name = calls[0].function.name
            return {
                "transfer_to_onboarding": "onboarding",
                "transfer_to_recruiting": "recruiting",
                "transfer_to_lifecycle": "lifecycle",
                "transfer_to_it_provisioning": "it_provisioning",
                "transfer_to_helpdesk": "helpdesk",
            }.get(name, "chat")
        if getattr(msg, "content", None):
            return "chat:" + msg.content
    except Exception:
        logger.exception("Orchestrator LLM routing failed; defaulting to onboarding keywords")
    return "chat"


async def run_orchestrator(
    prompt: str,
    history: Optional[List[Dict[str, Any]]] = None,
    user_id: str = "",
) -> AsyncGenerator[str, None]:
    history = history or []

    # HITL: Execution only if the latest USER message contains an exact tag.
    # Do not scan assistant text or earlier turns (that caused auto-send).
    if has_approval_tag(prompt, history):
        yield sse("delta", data="Approval detected — routing to the Execution agent.\n")
        async for frame in execution.run(prompt, history=history, user_id=user_id):
            yield frame
        yield sse("done")
        return

    choice = await _choose_worker(prompt, history)
    if choice.startswith("chat:"):
        yield sse("delta", data=choice[5:])
        yield sse("done")
        return
    if choice == "chat":
        messages = [
            {"role": "system", "content": ORCH_SYSTEM + "\nAnswer this HR question without tools if possible."},
            *history[-8:],
            {"role": "user", "content": prompt},
        ]
        async for frame in stream_text(messages):
            yield frame
        yield sse("done")
        return

    yield sse("delta", data=f"Routing to the {choice.replace('_', ' ')} agent.\n")
    worker = {
        "onboarding": onboarding.run,
        "recruiting": recruiting.run,
        "lifecycle": lifecycle.run,
        "it_provisioning": it_provisioning.run,
        "helpdesk": helpdesk.run,
    }[choice]
    try:
        async for frame in worker(prompt, history=history, user_id=user_id):
            yield frame
    except Exception:
        logger.exception("Worker %s crashed", choice)
        yield sse(
            "delta",
            data=f"The {choice.replace('_', ' ')} agent hit an error. Please try again with the missing details.",
        )
    yield sse("done")
