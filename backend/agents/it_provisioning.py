"""IT provisioning worker — drafts Teams/IT tickets; Execution sends them."""

from __future__ import annotations

from typing import Any, AsyncGenerator, Dict, List, Optional

from agents.runtime import llm_complete, sse, stream_text

SYSTEM = """You are the IT Provisioning worker.
Draft laptop, SSO, email, and access tickets. Do not send Teams messages yourself.
Put a clear IT draft in your reply. The HR user will confirm from the Side Canvas;
do not send anything and do not mention internal approval tags.
"""


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
    async for frame in stream_text(messages):
        yield frame
