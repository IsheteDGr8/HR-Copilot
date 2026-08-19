"""Per-request scope flags and pending clarification sessions."""

from __future__ import annotations

from contextvars import ContextVar, Token
from dataclasses import dataclass
from typing import Dict, Optional, Tuple

# Set True for HITL approval turns and internal system lookups (e.g. update by email).
bypass_scope: ContextVar[bool] = ContextVar("bypass_scope", default=False)

# True when the scope classifier allowed an internal employee record search this turn.
employee_lookup_allowed: ContextVar[bool] = ContextVar("employee_lookup_allowed", default=False)

# True when the user message passed HR scope (workflow / policy / systems).
hr_scope_allowed: ContextVar[bool] = ContextVar("hr_scope_allowed", default=False)


@dataclass
class PendingClarification:
    entity: str
    kind: str = "person"


# Keyed by (user_id, chat_run_id) — per browser tab / chat session.
_pending: Dict[str, PendingClarification] = {}


def _session_key(user_id: str, chat_run_id: str) -> str:
    uid = (user_id or "anonymous").strip()
    run = (chat_run_id or "default").strip()
    return f"{uid}:{run}"


def get_pending(user_id: str, chat_run_id: str) -> Optional[PendingClarification]:
    return _pending.get(_session_key(user_id, chat_run_id))


def set_pending(user_id: str, chat_run_id: str, entity: str) -> None:
    _pending[_session_key(user_id, chat_run_id)] = PendingClarification(entity=entity)


def clear_pending(user_id: str, chat_run_id: str) -> None:
    _pending.pop(_session_key(user_id, chat_run_id), None)


def reset_scope_flags() -> Tuple[Token, Token, Token]:
    """Reset scope contextvars for a new chat turn. Returns tokens for optional restore."""
    return (
        bypass_scope.set(False),
        employee_lookup_allowed.set(False),
        hr_scope_allowed.set(False),
    )


def apply_scope_flags(*, bypass: bool = False, employee_lookup: bool = False, hr_allowed: bool = False) -> None:
    bypass_scope.set(bypass)
    employee_lookup_allowed.set(employee_lookup)
    hr_scope_allowed.set(hr_allowed)
