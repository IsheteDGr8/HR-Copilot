"""Chat SSE endpoint — same contract as the Next.js frontend expects."""

from __future__ import annotations

import json
import logging
from typing import Any, AsyncGenerator, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from agents.orchestrator import run_orchestrator
from agents.runtime import sse
from core.agent.user_context import set_current_user_id
from core.security.jwt_auth import verify_jwt
from core.utils.document_parser import extract_text_from_upload

logger = logging.getLogger(__name__)

router = APIRouter()


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


@router.post("/chat/stream")
async def chat_stream(
    message: str = Form(...),
    messages: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
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

    async def generate() -> AsyncGenerator[str, None]:
        sent_done = False
        try:
            async for frame in run_orchestrator(
                prompt, history=history, user_id=user.get("user_id") or ""
            ):
                if '"event": "done"' in frame:
                    sent_done = True
                yield frame
        except Exception as exc:
            logger.exception("chat stream crashed")
            yield sse("delta", data=f"Something went wrong while processing that request: {exc}")
            yield sse("done")
            sent_done = True
        finally:
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
