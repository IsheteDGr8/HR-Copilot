"""Payroll / timesheet worker — timesheet compliance, payroll summaries, anomalies."""

from __future__ import annotations

import json
from typing import Any, AsyncGenerator, Dict, List, Optional

from agents.runtime import llm_complete, sse
from tools.bulk_email_tools import compile_bulk_email
from tools.payroll_tools import (
    flag_timesheet_anomalies,
    list_missing_timesheets,
    summarize_payroll_run,
)

SYSTEM = """You are the Payroll / Timesheet worker for ClosedAI HR.
Use list_missing_timesheets when HR asks who has not submitted timesheets or who is missing hours.
Use summarize_payroll_run for payroll run totals, gross/net, department breakdown, or pay period summary.
Use flag_timesheet_anomalies for overtime spikes, under-hours, or payroll exceptions.
Use draft_timesheet_reminder to email employees who have not submitted — NEVER send email directly.
After drafting reminders, the Side Canvas opens for human approval before send.
Never answer general knowledge questions — only internal HR payroll data.
"""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "list_missing_timesheets",
            "description": "List employees who have not submitted timesheets for a pay period.",
            "parameters": {
                "type": "object",
                "properties": {
                    "pay_period": {
                        "type": "string",
                        "description": "Pay period id e.g. 2026-PP17, or leave blank for current.",
                    },
                    "department": {"type": "string", "description": "Optional department filter."},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "summarize_payroll_run",
            "description": "Summarize payroll run totals, department breakdown, and exceptions.",
            "parameters": {
                "type": "object",
                "properties": {
                    "pay_period": {
                        "type": "string",
                        "description": "Pay period id e.g. 2026-PP17, or leave blank for current.",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "flag_timesheet_anomalies",
            "description": "Flag overtime spikes, under-hours, weekend work, and salary mismatches.",
            "parameters": {
                "type": "object",
                "properties": {
                    "pay_period": {"type": "string"},
                    "department": {"type": "string"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "draft_timesheet_reminder",
            "description": (
                "Draft a bulk reminder email to employees who have not submitted timesheets. "
                "Opens Side Canvas for approval before send."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "pay_period": {"type": "string"},
                    "department": {"type": "string"},
                    "subject": {"type": "string"},
                    "body_template": {"type": "string"},
                },
                "required": [],
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
        yield sse(
            "delta",
            data=getattr(msg, "content", None) or "Which pay period or department should I check?",
        )
        return

    for tc in tool_calls:
        name = tc.function.name
        args = json.loads(tc.function.arguments or "{}")
        yield sse("tool_start", tool=name, args=args)

        if name == "draft_timesheet_reminder":
            status = list_missing_timesheets(
                pay_period=str(args.get("pay_period") or ""),
                department=str(args.get("department") or ""),
            )
            if not status.get("ok"):
                yield sse("tool_end", tool=name, error=status.get("error"))
                yield sse("delta", data=status.get("error") or "Could not load missing timesheets.")
                return
            ids = ",".join(
                [
                    str(m.get("employee_id") or "")
                    for m in status.get("missing") or []
                    if m.get("employee_id")
                ]
            )
            period = str(status.get("pay_period_id") or "current period")
            subject = str(args.get("subject") or f"Action required: submit your timesheet for {period}")
            body_template = str(
                args.get("body_template")
                or (
                    "Hi {{first_name}},\n\n"
                    "Our records show your timesheet for {{department}} is not yet submitted for "
                    f"{period}. Please submit by end of day.\n\nThank you,\nHR Payroll"
                )
            )
            packet = compile_bulk_email(
                subject=subject,
                body_template=body_template,
                employee_ids=ids,
                department=str(args.get("department") or ""),
                title=f"Timesheet reminder — {period}",
                user_id=user_id,
            )
            if not packet.get("ok"):
                yield sse("tool_end", tool=name, error=packet.get("error"))
                yield sse("delta", data=packet.get("error") or "Could not draft reminder email.")
                return
            yield sse("tool_end", tool=name, result={"ok": True, "recipient_count": packet.get("recipient_count")})
            yield sse("canvas_update", data={"view": "BULK_EMAIL", "data": packet})
            yield sse(
                "delta",
                data=(
                    f"Reminder draft ready for {packet.get('recipient_count')} employees "
                    "who haven't submitted — review in the Side Canvas, then Approve & Send."
                ),
            )
            return

        if name == "list_missing_timesheets":
            packet = list_missing_timesheets(
                pay_period=str(args.get("pay_period") or ""),
                department=str(args.get("department") or ""),
            )
            if not packet.get("ok"):
                yield sse("tool_end", tool=name, error=packet.get("error"))
                yield sse("delta", data=packet.get("error") or "Could not load timesheet status.")
                return
            yield sse("tool_end", tool=name, result={"missing_count": packet.get("missing_count")})
            yield sse("canvas_update", data={"view": "TIMESHEET_STATUS", "data": packet})
            count = int(packet.get("missing_count") or 0)
            yield sse(
                "delta",
                data=(
                    f"{count} employee{'s' if count != 1 else ''} have not submitted timesheets "
                    f"for {packet.get('pay_period_id')}. See the Side Canvas for the chase list."
                ),
            )
            return

        if name == "summarize_payroll_run":
            packet = summarize_payroll_run(pay_period=str(args.get("pay_period") or ""))
            if not packet.get("ok"):
                yield sse("tool_end", tool=name, error=packet.get("error"))
                yield sse("delta", data=packet.get("error") or "Could not summarize payroll.")
                return
            yield sse("tool_end", tool=name, result={"total_gross": packet.get("total_gross")})
            yield sse("canvas_update", data={"view": "PAYROLL_SUMMARY", "data": packet})
            yield sse(
                "delta",
                data=(
                    f"Payroll summary for {packet.get('pay_period_id')}: "
                    f"${packet.get('total_gross', 0):,.0f} gross, "
                    f"{packet.get('missing_count', 0)} missing submissions. Details in the Side Canvas."
                ),
            )
            return

        if name == "flag_timesheet_anomalies":
            packet = flag_timesheet_anomalies(
                pay_period=str(args.get("pay_period") or ""),
                department=str(args.get("department") or ""),
            )
            if not packet.get("ok"):
                yield sse("tool_end", tool=name, error=packet.get("error"))
                yield sse("delta", data=packet.get("error") or "Could not scan anomalies.")
                return
            yield sse("tool_end", tool=name, result={"flagged_count": packet.get("flagged_count")})
            yield sse("canvas_update", data={"view": "TIMESHEET_STATUS", "data": {
                **packet,
                "missing": [],
                "missing_count": 0,
                "title": "Timesheet anomalies",
                "flagged": packet.get("flagged"),
            }})
            yield sse(
                "delta",
                data=f"Found {packet.get('flagged_count', 0)} timesheets with anomalies — see Side Canvas.",
            )
            return

        yield sse("tool_end", tool=name, error="Unknown tool")
        yield sse("delta", data="I couldn't run that payroll action.")
        return
