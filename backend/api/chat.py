"""Chat SSE endpoint — same contract as the Next.js frontend expects."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, AsyncGenerator, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from agents.orchestrator import run_orchestrator
from agents.runtime import has_approval_tag, sse
from core.agent.user_context import set_current_user_id
from core.security.scope_classifier import ScopeAction, classify_scope
from core.security.scope_context import apply_scope_flags, reset_scope_flags
from core.security.jwt_auth import verify_jwt
from core.utils.document_parser import extract_text_from_upload
from services.database import get_employee
from tools.azure_cosmos import (
    create_work_item,
    get_work_item_by_chat,
    update_work_item,
)

logger = logging.getLogger(__name__)

router = APIRouter()

_EXECUTION_TOOLS = frozenset(
    {
        "send_email",
        "resolve_hr_ticket",
        "commit_new_hire_to_db",
        "linkedin_publish",
        "update_employee_record",
        "dispatch_it_ticket",
    }
)

_CANVAS_SOURCE = {
    "ONBOARDING_TRACKER": "onboarding",
    "ONBOARDING_WORKFLOW": "onboarding",
    "ONBOARDING_CHECKLIST": "onboarding",
    "HELPDESK_TICKET": "helpdesk",
    "APPLICANT_TRACKER": "recruiting",
    "RESUME_SCREENING": "recruiting",
    "RECRUITING_POSTING": "recruiting",
    "DOCUMENT_CREATION": "recruiting",
    "LIFECYCLE_TRANSFER": "leave",
}


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str = Field(..., min_length=1)


def _parse_history(raw: Optional[str]) -> List[Dict[str, Any]]:
    if not raw or not str(raw).strip():
        return []
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid messages JSON: {exc}") from exc
    if not isinstance(parsed, list):
        raise HTTPException(status_code=400, detail="messages must be a JSON array")
    out: List[Dict[str, Any]] = []
    for item in parsed:
        msg = ChatMessage.model_validate(item)
        if msg.role == "system":
            continue
        out.append({"role": msg.role, "content": msg.content.strip()})
    return out[-40:]


def _parse_sse_payload(frame: str) -> Optional[dict]:
    text = (frame or "").strip()
    if not text.startswith("data:"):
        return None
    data_str = text[5:].strip()
    if not data_str or data_str == "[DONE]":
        return None
    try:
        parsed = json.loads(data_str)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _source_from_view(view: str) -> str:
    return _CANVAS_SOURCE.get((view or "").upper(), "adhoc")


def _format_employee_record(record: dict, search_term: str) -> str:
    if record.get("error"):
        return (
            f"I checked our employee records and didn't find anyone matching **{search_term}**. "
            "If you have an email or employee ID, I can search again."
        )
    name = record.get("name") or record.get("employee_name") or search_term
    role = record.get("role") or record.get("title") or "—"
    dept = record.get("department") or "—"
    email = record.get("email") or record.get("personal_email") or "—"
    emp_id = record.get("employeeId") or record.get("id") or "—"
    start = record.get("hireDate") or record.get("start_date") or "—"
    salary = record.get("annualSalary") or record.get("salary")
    salary_line = f"- **Salary:** ${salary:,}\n" if isinstance(salary, (int, float)) else ""
    return (
        f"Here's what I found for **{name}** in our employee records:\n"
        f"- **Employee ID:** {emp_id}\n"
        f"- **Role:** {role}\n"
        f"- **Department:** {dept}\n"
        f"- **Email:** {email}\n"
        f"- **Start date:** {start}\n"
        f"{salary_line}"
        "\nTell me if you need a transfer packet, policy check, or another HR action for this person."
    )


async def _stream_employee_lookup(entity: str) -> AsyncGenerator[str, None]:
    result = await asyncio.to_thread(get_employee, entity)
    yield sse("delta", data=_format_employee_record(result if isinstance(result, dict) else {}, entity))
    yield sse("done")


async def _work_upsert(
    *,
    user_id: str,
    run_id: str,
    title: str,
    status: str,
    source: str = "adhoc",
    summary: str = "",
    progress: int | None = None,
    existing_id: str | None = None,
) -> Optional[str]:
    def _do() -> Optional[str]:
        try:
            doc = None
            if existing_id:
                from tools.azure_cosmos import get_work_item

                doc = get_work_item(existing_id, user_id)
            if not doc and run_id:
                doc = get_work_item_by_chat(user_id, run_id)
            updates: Dict[str, Any] = {"status": status}
            if title:
                updates["title"] = title
            if source:
                updates["source"] = source
            if summary:
                updates["summary"] = summary
            if progress is not None:
                updates["progress"] = progress
            if doc:
                saved = update_work_item(str(doc.get("id") or ""), updates, user_id=user_id)
                return str((saved or doc).get("id") or "")
            if not run_id:
                return None
            saved = create_work_item(
                user_id=user_id,
                title=title or "Agent task",
                source=source,
                status=status,
                summary=summary,
                run_id=run_id,
                linked_chat_id=run_id,
                progress=progress or 10,
            )
            return str(saved.get("id") or "")
        except Exception:
            logger.debug("work upsert failed", exc_info=True)
            return None

    return await asyncio.to_thread(_do)


@router.post("/chat/stream")
async def chat_stream(
    message: str = Form(...),
    messages: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    run_id: Optional[str] = Form(None),
    work_title: Optional[str] = Form(None),
    user: dict = Depends(verify_jwt),
):
    set_current_user_id(user.get("user_id"))
    prompt = (message or "").strip()
    if not prompt and not file:
        raise HTTPException(status_code=400, detail="message is required")
    if not prompt:
        prompt = "Please review the attached document."
    if file is not None and file.filename:
        try:
            file_bytes = await file.read()
            if file_bytes:
                extracted = extract_text_from_upload(file_bytes, file.filename or "upload")
                prompt = f"{prompt}\n\n<Attached_Document>\n{extracted}\n</Attached_Document>"
        except Exception as exc:
            prompt = f"{prompt}\n\n<Attached_Document>\n[Document extraction failed: {exc}]\n</Attached_Document>"

    history = _parse_history(messages)
    user_id = str(user.get("user_id") or "")
    chat_run_id = (run_id or "").strip()
    title = (work_title or "").strip() or (prompt.split("\n", 1)[0][:80] or "Agent task")

    async def generate() -> AsyncGenerator[str, None]:
        sent_done = False
        work_id: Optional[str] = None
        saw_canvas = False
        saw_approval = False
        saw_execution = False
        stream_failed = False
        source = "adhoc"

        if chat_run_id:
            try:
                existing = await asyncio.to_thread(get_work_item_by_chat, user_id, chat_run_id)
            except Exception:
                existing = None
            if existing:
                work_id = str(existing.get("id") or "")
                work_id = await _work_upsert(
                    user_id=user_id,
                    run_id=chat_run_id,
                    title=title or str(existing.get("title") or ""),
                    status="running",
                    source=str(existing.get("source") or "adhoc"),
                    progress=20,
                    existing_id=work_id,
                )

        try:
            reset_scope_flags()
            if has_approval_tag(prompt, history):
                apply_scope_flags(bypass=True, hr_allowed=True, employee_lookup=True)
            else:
                decision = classify_scope(
                    prompt,
                    history=history,
                    user_id=user_id,
                    chat_run_id=chat_run_id,
                )
                if decision.action == ScopeAction.BLOCK:
                    yield sse("delta", data=decision.message or "")
                    yield sse("done")
                    sent_done = True
                    return
                if decision.action == ScopeAction.CLARIFY:
                    yield sse("delta", data=decision.message or "")
                    yield sse("done")
                    sent_done = True
                    return
                if decision.action == ScopeAction.EMPLOYEE_LOOKUP and decision.entity:
                    apply_scope_flags(employee_lookup=True, hr_allowed=True)
                    async for frame in _stream_employee_lookup(decision.entity):
                        yield frame
                    sent_done = True
                    return
                apply_scope_flags(
                    hr_allowed=decision.hr_allowed,
                    employee_lookup=decision.employee_lookup,
                )

            async for frame in run_orchestrator(
                prompt, history=history, user_id=user_id
            ):
                payload = _parse_sse_payload(frame)
                event = str((payload or {}).get("event") or "")
                if event == "done":
                    sent_done = True
                if event == "canvas_update":
                    saw_canvas = True
                    data = (payload or {}).get("data") or {}
                    view = str(data.get("view") or "") if isinstance(data, dict) else ""
                    source = _source_from_view(view)
                    if source != "adhoc" or saw_canvas:
                        work_id = await _work_upsert(
                            user_id=user_id,
                            run_id=chat_run_id,
                            title=title,
                            status="running",
                            source=source,
                            progress=40,
                            existing_id=work_id,
                        )
                if event == "tool_end":
                    tool = str((payload or {}).get("tool") or "")
                    result = (payload or {}).get("result")
                    if tool in _EXECUTION_TOOLS:
                        saw_execution = True
                    if isinstance(result, dict) and str(result.get("status") or "") == "awaiting_approval":
                        saw_approval = True
                        work_id = await _work_upsert(
                            user_id=user_id,
                            run_id=chat_run_id,
                            title=title,
                            status="needs_approval",
                            source=source,
                            progress=60,
                            existing_id=work_id,
                        )
                yield frame
        except Exception as exc:
            logger.exception("chat stream crashed")
            stream_failed = True
            if chat_run_id or work_id:
                await _work_upsert(
                    user_id=user_id,
                    run_id=chat_run_id,
                    title=title,
                    status="failed",
                    source=source,
                    summary=str(exc),
                    progress=0,
                    existing_id=work_id,
                )
            yield sse("delta", data=f"Something went wrong while processing that request: {exc}")
            yield sse("done")
            sent_done = True
        finally:
            if saw_canvas or saw_approval or work_id:
                if stream_failed:
                    final_status = "failed"
                    progress = 0
                elif saw_execution:
                    final_status = "completed"
                    progress = 100
                elif saw_approval:
                    final_status = "needs_approval"
                    progress = 60
                else:
                    final_status = "completed"
                    progress = 100
                await _work_upsert(
                    user_id=user_id,
                    run_id=chat_run_id,
                    title=title,
                    status=final_status,
                    source=source,
                    progress=progress,
                    existing_id=work_id,
                )
            if not sent_done:
                yield sse("done")

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
