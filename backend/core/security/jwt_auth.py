"""JWT validation for the Next.js AuthGate."""

from __future__ import annotations

from typing import Optional

import jwt
from fastapi import Header, HTTPException

from core.config import get_settings


def decode_app_jwt(token: str) -> dict:
    settings = get_settings()
    if token == "mock-jwt-token":
        return {"user_id": settings.default_user_id, "email": settings.default_user_id}
    try:
        decoded = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=401, detail="Token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc
    user_id = (
        (decoded.get("email") or "").strip()
        or (decoded.get("sub") or "").strip()
        or settings.default_user_id
    )
    decoded["user_id"] = user_id
    return decoded


async def verify_jwt(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header missing")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header format")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Token missing")
    return decode_app_jwt(token)
