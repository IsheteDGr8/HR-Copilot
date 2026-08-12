"""Per-request user identity for the agent tool layer."""

from __future__ import annotations

import os
from contextvars import ContextVar
from typing import Optional

_user_id: ContextVar[Optional[str]] = ContextVar("agent_user_id", default=None)


def set_current_user_id(user_id: Optional[str]) -> None:
    _user_id.set((user_id or "").strip() or None)


def get_current_user_id() -> str:
    return _user_id.get() or os.getenv("DEFAULT_USER_ID", "test_user")
