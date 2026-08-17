"""Local FastMCP server mounted on the FastAPI app for SaaS integrations."""

from __future__ import annotations

import logging
from typing import Any, Callable, Dict, Optional

logger = logging.getLogger(__name__)

_TOOL_FNS: Dict[str, Callable[..., Any]] = {}


class _FallbackMCP:
    """Minimal FastMCP-compatible registry if the fastmcp package is unavailable."""

    def __init__(self, name: str) -> None:
        self.name = name

    def tool(self, *args, **kwargs):
        def decorator(fn: Callable[..., Any]):
            _TOOL_FNS[fn.__name__] = fn
            return fn

        if args and callable(args[0]) and not kwargs:
            return decorator(args[0])
        return decorator

    def http_app(self, path: str = "/mcp"):
        return None


def _build_mcp():
    try:
        from fastmcp import FastMCP

        instance = FastMCP("hr-copilot-saas")
        logger.info("FastMCP server initialized")
        return instance, True
    except Exception:
        logger.warning(
            "FastMCP HTTP transport not loaded. "
            "SaaS tools still register in-process for the Execution agent.",
            exc_info=True,
        )
        return _FallbackMCP("hr-copilot-saas"), False


mcp, FASTMCP_AVAILABLE = _build_mcp()


def _capture_tools() -> None:
    from . import gmail_tools, graph_tools, linkedin_tools

    original_tool = mcp.tool

    def tracking_tool(*args, **kwargs):
        deco = original_tool(*args, **kwargs)

        def wrapper(fn):
            registered = deco(fn) if callable(deco) else fn
            _TOOL_FNS[fn.__name__] = fn
            return registered

        if args and callable(args[0]) and not kwargs:
            _TOOL_FNS[args[0].__name__] = args[0]
            return deco
        return wrapper

    mcp.tool = tracking_tool  # type: ignore[method-assign]
    gmail_tools.register(mcp)
    graph_tools.register(mcp)
    linkedin_tools.register(mcp)
    mcp.tool = original_tool  # type: ignore[method-assign]


_capture_tools()


def call_mcp_tool(name: str, **kwargs: Any) -> Any:
    """In-process dispatch used by the Execution Agent (same process as FastAPI)."""
    fn = _TOOL_FNS.get(name)
    if fn is None:
        raise KeyError(f"Unknown MCP tool: {name}")
    return fn(**kwargs)


def get_mcp_http_app():
    if not FASTMCP_AVAILABLE:
        return None
    try:
        return mcp.http_app(path="/")
    except Exception:
        logger.exception("FastMCP http_app() failed")
        return None
