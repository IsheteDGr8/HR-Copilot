"""Gmail MCP client — connects via the official Python MCP SDK (stdio).

Tools discovered from the Gmail MCP server are registered into the shared LLM
`registry` so the agent loop can call them like native tools.
"""

from __future__ import annotations

import json
import logging
import os
import shlex
from contextlib import AsyncExitStack
from typing import Any, Dict, List, Optional

from mcp.client.session import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client

from core.agent.registry import registry

logger = logging.getLogger(__name__)

# Keep the stdio transport + session alive for the process lifetime.
_exit_stack: Optional[AsyncExitStack] = None
_session: Optional[ClientSession] = None
_registered_tool_names: List[str] = []


def _parse_args(raw: str) -> List[str]:
    """Parse GMAIL_MCP_ARGS from JSON array, comma-separated, or shell-style."""
    text = (raw or "").strip()
    if not text:
        return []
    if text.startswith("["):
        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                return [str(x) for x in parsed]
        except json.JSONDecodeError:
            pass
    if "," in text and " " not in text.split(",")[0]:
        return [p.strip() for p in text.split(",") if p.strip()]
    return shlex.split(text)


def _tool_result_to_payload(result: Any) -> Any:
    """Normalize MCP CallToolResult into something JSON-serializable for the LLM."""
    if result is None:
        return {"ok": True}

    # Prefer structured content when present.
    structured = getattr(result, "structuredContent", None) or getattr(
        result, "structured_content", None
    )
    if structured is not None:
        return structured

    content = getattr(result, "content", None) or []
    texts: List[str] = []
    for block in content:
        text = getattr(block, "text", None)
        if isinstance(text, str) and text.strip():
            texts.append(text.strip())
        elif isinstance(block, dict) and block.get("text"):
            texts.append(str(block["text"]))

    is_error = bool(getattr(result, "isError", None) or getattr(result, "is_error", None))
    if texts:
        payload: Dict[str, Any] = {"text": "\n\n".join(texts)}
        if is_error:
            payload["error"] = payload["text"]
        return payload

    # Last resort: model_dump / dict.
    if hasattr(result, "model_dump"):
        try:
            return result.model_dump()
        except Exception:
            pass
    return {"result": str(result), "is_error": is_error}


def _make_tool_wrapper(session: ClientSession, tool_name: str):
    async def _wrapper(**arguments: Any) -> Any:
        try:
            result = await session.call_tool(tool_name, arguments or {})
            return _tool_result_to_payload(result)
        except Exception as exc:
            return {
                "error": f"Gmail MCP tool '{tool_name}' failed: {exc}",
                "hint": "Check Gmail MCP credentials and that the server is running.",
            }

    _wrapper.__name__ = tool_name
    _wrapper.__doc__ = f"MCP tool: {tool_name}"
    return _wrapper


async def init_gmail_mcp() -> bool:
    """Start the Gmail MCP stdio server and register its tools on the LLM registry.

    Returns True when tools were registered; False when skipped/failed (non-fatal).
    """
    global _exit_stack, _session, _registered_tool_names

    enabled = os.getenv("GMAIL_MCP_ENABLED", "true").lower() not in ("0", "false", "no")
    if not enabled:
        logger.info("Gmail MCP disabled (GMAIL_MCP_ENABLED=false).")
        return False

    # Defaults: Node-based Gmail MCP via npx (common community package).
    command = (os.getenv("GMAIL_MCP_COMMAND") or "npx").strip()
    args = _parse_args(
        os.getenv("GMAIL_MCP_ARGS")
        or "-y @gongrzhe/server-gmail-autoauth-mcp"
    )

    if _exit_stack is not None:
        # Already initialized (e.g. hot reload edge case).
        return bool(_registered_tool_names)

    stack = AsyncExitStack()
    try:
        await stack.__aenter__()

        server_params = StdioServerParameters(
            command=command,
            args=args,
            env=dict(os.environ),  # Pass Google / OAuth credentials through.
        )

        read, write = await stack.enter_async_context(stdio_client(server_params))
        session = await stack.enter_async_context(ClientSession(read, write))
        await session.initialize()

        listed = await session.list_tools()
        tools = getattr(listed, "tools", None) or []

        registered: List[str] = []
        for tool in tools:
            name = getattr(tool, "name", None)
            if not name:
                continue
            description = getattr(tool, "description", None) or f"Gmail MCP tool: {name}"
            input_schema = (
                getattr(tool, "inputSchema", None)
                or getattr(tool, "input_schema", None)
                or {"type": "object", "properties": {}}
            )
            if hasattr(input_schema, "model_dump"):
                input_schema = input_schema.model_dump()

            wrapper = _make_tool_wrapper(session, name)
            # Prefix avoids collisions with native HR tools if names overlap.
            reg_name = name if name not in registry._tools else f"gmail_{name}"
            registry.register_external(
                name=reg_name,
                description=description,
                schema=dict(input_schema) if isinstance(input_schema, dict) else {
                    "type": "object",
                    "properties": {},
                },
                func=wrapper,
            )
            registered.append(reg_name)

        _exit_stack = stack
        _session = session
        _registered_tool_names = registered
        logger.info(
            "Gmail MCP ready (%s tool(s)): %s",
            len(registered),
            ", ".join(registered) or "(none)",
        )
        return bool(registered)
    except Exception as exc:
        logger.warning("Gmail MCP init skipped/failed: %s", exc)
        try:
            await stack.aclose()
        except Exception:
            pass
        _exit_stack = None
        _session = None
        _registered_tool_names = []
        return False


async def shutdown_gmail_mcp() -> None:
    """Tear down the Gmail MCP stdio session (app shutdown)."""
    global _exit_stack, _session, _registered_tool_names

    for name in list(_registered_tool_names):
        registry._tools.pop(name, None)
    _registered_tool_names = []
    _session = None

    if _exit_stack is not None:
        try:
            await _exit_stack.aclose()
        except Exception as exc:
            logger.debug("Gmail MCP shutdown error: %s", exc)
        _exit_stack = None
