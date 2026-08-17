"""Execution agent — the ONLY writer (Cosmos upserts, Gmail/Graph send).

Runs only when the latest user message contains an exact HITL tag.
Provisioning uses the cached Python packet — never model-written email copy.
"""

from __future__ import annotations

import json
import re
from typing import Any, AsyncGenerator, Dict, List, Optional

from agents.runtime import approval_kind, llm_complete, sse
from integrations.gmail_tools import gmail_send
from integrations.it_dispatcher import dispatch_it_ticket
from integrations.linkedin_tools import linkedin_publish_posting
from tools.azure_cosmos import (
    commit_new_hire,
    init_onboarding_checklist,
    update_employee_field,
)
from tools.onboarding_tools import get_stashed_packet
from tools.lifecycle_tools import get_stashed_transfer
from tools.recruiting_tools import get_stashed_posting

SYSTEM_UPDATE = """You are the Execution agent. Mutating tools are allowed only because the
latest user message contains [UPDATE APPROVED]. Call update_employee_record only.
"""

UPDATE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "update_employee_record",
            "description": "Update one field on an employee document.",
            "parameters": {
                "type": "object",
                "properties": {
                    "email": {"type": "string"},
                    "field_name": {"type": "string"},
                    "new_value": {"type": "string"},
                },
                "required": ["email", "field_name", "new_value"],
            },
        },
    },
]


def _commit_hire_and_checklist(packet: dict) -> dict:
    saved = commit_new_hire(packet)
    emp_id = str(saved.get("employeeId") or saved.get("id") or "")
    nda_required = bool(packet.get("include_nda", True))
    checklist = init_onboarding_checklist(
        emp_id,
        employee_name=saved.get("name") or packet.get("employee_name") or "",
        role=saved.get("role") or packet.get("role") or "",
        department=saved.get("department") or packet.get("department") or "",
        nda_required=nda_required,
    )
    return {"employee": saved, "checklist": checklist}


def execute_tool(name: str, args: dict, user_id: str) -> Any:
    if name == "update_employee_record":
        return update_employee_field(args["email"], args["field_name"], args.get("new_value"))
    if name in ("send_email", "commit_new_hire_to_db", "send_graph_mail", "post_teams_message"):
        raise PermissionError(f"{name} is not LLM-callable on this path.")
    return {"error": f"Unknown execution tool {name}"}


def _parse_approved_send(prompt: str) -> Optional[dict]:
    to_m = re.search(r"To:\s*([^,]+)", prompt, re.I)
    sub_m = re.search(r"Subject:\s*(.+?)(?:,\s*Body:|$)", prompt, re.I | re.S)
    body_m = re.search(r"Body:\s*(.*)$", prompt, re.I | re.S)
    if not (to_m and sub_m and body_m):
        return None
    return {
        "to": to_m.group(1).strip(),
        "subject": sub_m.group(1).strip().rstrip(","),
        "body": body_m.group(1).strip(),
    }


async def _run_provisioning(user_id: str) -> AsyncGenerator[str, None]:
    packet = get_stashed_packet(user_id)
    if not packet:
        yield sse(
            "delta",
            data="No onboarding packet is cached. Prepare the packet in Side Canvas first, then confirm.",
        )
        return

    yield sse("tool_start", tool="commit_new_hire_to_db", args={"personal_email": packet.get("personal_email")})
    try:
        committed = _commit_hire_and_checklist(packet)
        emp = committed["employee"]
        checklist = committed["checklist"]
        yield sse("tool_end", tool="commit_new_hire_to_db", result={"id": emp.get("id"), "ok": True})
    except Exception as exc:
        yield sse("tool_end", tool="commit_new_hire_to_db", error=str(exc))
        yield sse("delta", data=f"Could not commit the new hire: {exc}")
        return

    to = packet.get("personal_email") or ""
    if not to:
        yield sse("delta", data="Hire saved, but no personal_email was on the packet — skipped email send.")
    else:
        sends = [
            (
                "email_1_welcome",
                packet.get("email_1_subject") or f"Welcome to ClosedAI, {packet.get('first_name')}",
                packet.get("email_1_welcome") or "",
            ),
            (
                "email_2_action",
                packet.get("email_2_subject") or f"Action required: onboarding documents",
                packet.get("email_2_action") or "",
            ),
            (
                "email_3_roadmap",
                packet.get("email_3_subject") or f"Your Week 1 roadmap",
                packet.get("email_3_roadmap") or "",
            ),
        ]
        sent = 0
        for label, subject, body in sends:
            if not body.strip():
                yield sse("tool_end", tool="send_email", error=f"{label} body was empty — skipped")
                continue
            yield sse("tool_start", tool="send_email", args={"to": to, "subject": subject, "label": label})
            try:
                result = gmail_send(to=to, subject=subject, body=body, user_id=user_id)
                yield sse("tool_end", tool="send_email", result={**result, "label": label})
                sent += 1
            except Exception as exc:
                yield sse("tool_end", tool="send_email", error=f"{label}: {exc}")
                yield sse(
                    "delta",
                    data=f"Hire saved. Sent {sent}/3 emails before failure on {label}: {exc}",
                )
                return
        yield sse("delta", data=f"Dispatched {sent}/3 onboarding emails to {to}.\n")

    # Hand the drafted IT ticket to the (mock) IT sink. Never block provisioning.
    emp_id = str(emp.get("employeeId") or emp.get("id") or "")
    if (packet.get("it_tickets") or "").strip():
        yield sse("tool_start", tool="dispatch_it_ticket", args={"employee_id": emp_id})
        try:
            ticket = dispatch_it_ticket(user_id, {**packet, "employee_id": emp_id})
            yield sse("tool_end", tool="dispatch_it_ticket", result=ticket)
            yield sse("delta", data=f"IT ticket {ticket.get('ticket_id')} submitted ({ticket.get('mode')}).\n")
        except Exception as exc:
            yield sse("tool_end", tool="dispatch_it_ticket", error=str(exc))
            yield sse("delta", data=f"Hire saved; IT ticket dispatch failed (non-blocking): {exc}\n")

    tracker = {
        **checklist,
        "employee_id": emp.get("employeeId") or emp.get("id"),
        "employee_name": emp.get("name") or packet.get("employee_name"),
        "role": emp.get("role") or packet.get("role"),
        "department": emp.get("department") or packet.get("department"),
        "checklist_flags": packet.get("checklist_flags") or {},
    }
    yield sse("canvas_update", data={"view": "ONBOARDING_TRACKER", "data": tracker})
    yield sse(
        "delta",
        data=(
            f"Committed {emp.get('id')}. Onboarding tracker is open in the Side Canvas."
        ),
    )


async def _run_transfer_update(user_id: str, packet: dict) -> AsyncGenerator[str, None]:
    """Apply a stashed transfer packet: department, managerId, salary (+ NDA addendum)."""
    email = packet.get("email") or ""
    if not email:
        yield sse("delta", data="Transfer packet has no employee email on file — cannot apply.")
        return
    changes = packet.get("changes") or {}
    # (field_name, target_value) pairs to write on the employee doc.
    writes: List[tuple] = []
    dept = (changes.get("department") or {}).get("to")
    if dept and dept != (changes.get("department") or {}).get("from"):
        writes.append(("department", dept))
    mgr = (changes.get("manager") or {}).get("to")
    if mgr and mgr != (changes.get("manager") or {}).get("from"):
        writes.append(("managerId", mgr))
        writes.append(("manager", mgr))
    sal = (changes.get("salary") or {}).get("to")
    if sal is not None and sal != (changes.get("salary") or {}).get("from"):
        writes.append(("annualSalary", sal))
        writes.append(("salary", sal))

    if not writes:
        yield sse("delta", data="No field changes were detected on the transfer packet.")
        return

    applied: List[str] = []
    for field, value in writes:
        yield sse("tool_start", tool="update_employee_record", args={"email": email, "field_name": field})
        try:
            result = update_employee_field(email, field, value)
            if isinstance(result, dict) and result.get("error"):
                yield sse("tool_end", tool="update_employee_record", error=result["error"])
                continue
            yield sse("tool_end", tool="update_employee_record", result={"field": field, "ok": True})
            applied.append(f"{field}={value}")
        except Exception as exc:
            yield sse("tool_end", tool="update_employee_record", error=str(exc))

    # RCW 49.62 addendum: email the NDA/non-compete when the promotion crosses the threshold.
    if packet.get("nda_addendum_required"):
        subject = "Action required: NDA / non-compete addendum for your transfer"
        link = packet.get("nda_link") or ""
        body = (
            f"Hi {packet.get('employee_name') or ''},\n\n"
            "Your recent compensation change requires a non-compete/NDA addendum under "
            "Washington RCW 49.62. Please review and sign:\n"
            f"{link or '(document link will be provided separately)'}\n\n"
            "Thank you."
        )
        yield sse("tool_start", tool="send_email", args={"to": email, "subject": subject, "label": "nda_addendum"})
        try:
            res = gmail_send(to=email, subject=subject, body=body, user_id=user_id)
            yield sse("tool_end", tool="send_email", result={**res, "label": "nda_addendum"})
            applied.append("nda_addendum emailed")
        except Exception as exc:
            yield sse("tool_end", tool="send_email", error=f"nda_addendum: {exc}")

    yield sse("delta", data="Transfer applied: " + (", ".join(applied) if applied else "no changes"))


async def run(
    prompt: str,
    history: Optional[List[Dict[str, Any]]] = None,
    user_id: str = "",
) -> AsyncGenerator[str, None]:
    kind = approval_kind(prompt)
    if kind == "provisioning":
        async for frame in _run_provisioning(user_id):
            yield frame
        return

    if kind == "posting":
        posting = get_stashed_posting(user_id)
        if not posting or not posting.get("ok"):
            yield sse("delta", data="No compliant posting is cached. Draft one in Recruiting first.")
            return
        yield sse("tool_start", tool="linkedin_publish", args={"title": posting.get("title")})
        result = linkedin_publish_posting(user_id, posting)
        if result.get("ok"):
            mode = result.get("mode") or "linkedin"
            yield sse("tool_end", tool="linkedin_publish", result={"ok": True, "mode": mode})
            if mode == "mock":
                yield sse(
                    "delta",
                    data=(
                        f"Published '{posting.get('title')}' in mock mode "
                        f"(no LinkedIn token connected). "
                        f"{result.get('message') or 'Simulated LinkedIn post successful.'} "
                        "Check the backend terminal for the logged payload."
                    ),
                )
            else:
                yield sse(
                    "delta",
                    data=f"Published '{posting.get('title')}' to LinkedIn successfully.",
                )
        else:
            yield sse("tool_end", tool="linkedin_publish", error=result.get("error"))
            yield sse("delta", data=f"Posting not published: {result.get('error')}")
        return

    if kind == "send":
        parsed = _parse_approved_send(prompt)
        if not parsed:
            yield sse("delta", data="Approval received but To/Subject/Body could not be parsed.")
            return
        yield sse("tool_start", tool="send_email", args={"to": parsed["to"], "subject": parsed["subject"]})
        try:
            result = gmail_send(
                to=parsed["to"],
                subject=parsed["subject"],
                body=parsed["body"],
                user_id=user_id,
            )
            yield sse("tool_end", tool="send_email", result=result)
            yield sse("delta", data=f"Email sent to {parsed['to']}.")
        except Exception as exc:
            yield sse("tool_end", tool="send_email", error=str(exc))
            yield sse("delta", data=str(exc))
        return

    # Prefer the deterministic transfer packet drafted by the Lifecycle worker.
    transfer = get_stashed_transfer(user_id)
    if transfer and transfer.get("ok"):
        async for frame in _run_transfer_update(user_id, transfer):
            yield frame
        return

    messages: List[Dict[str, Any]] = [
        {"role": "system", "content": SYSTEM_UPDATE},
        *(history or []),
        {"role": "user", "content": prompt},
    ]
    response = await llm_complete(messages, tools=UPDATE_TOOLS, stream=False)
    msg = response.choices[0].message
    tool_calls = getattr(msg, "tool_calls", None) or []
    if not tool_calls:
        yield sse("delta", data=getattr(msg, "content", None) or "Approval received but I could not infer an update.")
        return
    summaries = []
    for tc in tool_calls:
        if tc.function.name != "update_employee_record":
            yield sse("tool_end", tool=tc.function.name, error="blocked: tool not allowed for this approval tag")
            continue
        args = json.loads(tc.function.arguments or "{}")
        yield sse("tool_start", tool=tc.function.name, args=args)
        try:
            result = execute_tool(tc.function.name, args, user_id)
            yield sse("tool_end", tool=tc.function.name, result=result)
            summaries.append(f"{tc.function.name}: {json.dumps(result, default=str)[:800]}")
        except Exception as exc:
            yield sse("tool_end", tool=tc.function.name, error=str(exc))
            summaries.append(f"{tc.function.name} failed: {exc}")
    yield sse("delta", data="Execution finished.\n" + "\n".join(summaries))
