"""Short-lived signed cookies for OAuth PKCE (survives uvicorn reload)."""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import jwt
from fastapi import Request
from fastapi.responses import Response

COOKIE_LOGIN = "oauth_pkce_login"
COOKIE_GMAIL = "oauth_pkce_gmail"
_TTL_SECONDS = 600


def _secret() -> str:
    return (os.getenv("JWT_SECRET") or "").strip() or "dev-only-hr-copilot-jwt-secret-change-me"


def encode_pkce(state: str, verifier: str, **extra: Any) -> str:
    now = datetime.now(timezone.utc)
    payload: Dict[str, Any] = {
        "state": state,
        "v": verifier,
        "iat": now,
        "exp": now + timedelta(seconds=_TTL_SECONDS),
        **extra,
    }
    return jwt.encode(payload, _secret(), algorithm="HS256")


def decode_pkce(token: Optional[str], expected_state: Optional[str] = None) -> Optional[Dict[str, Any]]:
    if not token:
        return None
    try:
        data = jwt.decode(token, _secret(), algorithms=["HS256"])
    except jwt.InvalidTokenError:
        return None
    if expected_state and data.get("state") != expected_state:
        return None
    if not data.get("v"):
        return None
    return data


def set_pkce_cookie(response: Response, name: str, state: str, verifier: str, **extra: Any) -> None:
    response.set_cookie(
        key=name,
        value=encode_pkce(state, verifier, **extra),
        httponly=True,
        samesite="lax",
        max_age=_TTL_SECONDS,
        path="/",
    )


def read_pkce_cookie(
    request: Request,
    name: str,
    expected_state: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    return decode_pkce(request.cookies.get(name), expected_state=expected_state)


def clear_pkce_cookie(response: Response, name: str) -> None:
    response.delete_cookie(key=name, path="/")
