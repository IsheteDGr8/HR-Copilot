"""Shared LiteLLM + SSE helpers for supervisor/worker agents."""

from __future__ import annotations

import json
import logging
from typing import Any, AsyncGenerator, Dict, List, Optional

from litellm import acompletion

from core.config import get_settings

logger = logging.getLogger(__name__)

MAX_TOOL_ITERATIONS = 3

APPROVAL_TAGS = (
    "[PROVISIONING APPROVED]",
    "[UPDATE APPROVED]",
    "[APPROVED TO SEND]",
    "[POSTING APPROVED]",
)


def latest_user_text(prompt: str, history: Optional[List[Dict[str, Any]]] = None) -> str:
    """Only the current user turn — never assistant text or prior turns."""
    return (prompt or "").strip()


def latest_text(prompt: str, history: Optional[List[Dict[str, Any]]] = None) -> str:
    return latest_user_text(prompt, history)


def has_approval_tag(prompt: str, history: Optional[List[Dict[str, Any]]] = None) -> bool:
    """True only when the latest user message contains an exact HITL tag.

    Assistant copy that mentions the tag (e.g. 'wait for [PROVISIONING APPROVED]')
    must never trigger Execution.
    """
    blob = latest_user_text(prompt, history)
    return any(tag in blob for tag in APPROVAL_TAGS)


def approval_kind(prompt: str) -> Optional[str]:
    text = prompt or ""
    if "[PROVISIONING APPROVED]" in text:
        return "provisioning"
    if "[APPROVED TO SEND]" in text:
        return "send"
    if "[POSTING APPROVED]" in text:
        return "posting"
    if "[UPDATE APPROVED]" in text:
        return "update"
    return None


def sse(event: str, **payload: Any) -> str:
    body = {"event": event, **payload}
    return f"data: {json.dumps(body, default=str, ensure_ascii=False)}\n\n"


async def llm_complete(
    messages: List[Dict[str, Any]],
    tools: Optional[List[Dict[str, Any]]] = None,
    stream: bool = False,
) -> Any:
    kwargs = get_settings().litellm_kwargs()
    extra: Dict[str, Any] = {
        "messages": messages,
        "stream": stream,
        "timeout": 60,
        **kwargs,
    }
    if tools:
        extra["tools"] = tools
        names = [
            (t.get("function") or {}).get("name")
            for t in tools
            if isinstance(t, dict)
        ]
        logger.info("LLM call with tools=%s stream=%s", names, stream)
    return await acompletion(**extra)


async def stream_text(messages: List[Dict[str, Any]]) -> AsyncGenerator[str, None]:
    response = await llm_complete(messages, stream=True)
    async for chunk in response:
        delta = chunk.choices[0].delta
        if getattr(delta, "content", None):
            yield sse("delta", data=delta.content)
