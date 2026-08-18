"""Native Google / Gmail OAuth integration endpoints."""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException, Header, Query, Request
from fastapi.responses import RedirectResponse

from core.security.pkce_cookie import (
    COOKIE_GMAIL,
    clear_pkce_cookie,
    read_pkce_cookie,
    set_pkce_cookie,
)

from services.db import db_service
from services.google_oauth import (
    build_auth_flow,
    credentials_to_token_dict,
    frontend_tools_url,
    google_redirect_uri,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/integrations", tags=["integrations"])

DEFAULT_USER_ID = os.getenv("DEFAULT_USER_ID", "test_user")

# Temporary in-memory PKCE store: oauth `state` -> {code_verifier, user_id}.
oauth_state_store: Dict[str, Dict[str, Any]] = {}


def _jwt_secret() -> str:
    secret = (os.getenv("JWT_SECRET") or "").strip()
    if not secret:
        return "dev-only-hr-copilot-jwt-secret-change-me"
    return secret


def _user_id_from_jwt(token: str) -> str:
    """Decode app JWT and return a stable user key (email preferred)."""
    try:
        decoded = jwt.decode(token, _jwt_secret(), algorithms=["HS256"])
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=401, detail="Token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc

    user_id = (
        (decoded.get("email") or "").strip()
        or (decoded.get("sub") or "").strip()
        or (decoded.get("user_id") or "").strip()
    )
    if not user_id:
        raise HTTPException(status_code=401, detail="Token missing user identity")
    return user_id


def _bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    return token or None


async def require_user(authorization: Optional[str] = Header(None)) -> dict:
    token = _bearer_token(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Authorization header missing")
    # Dev mock still used by some legacy callers.
    if token == "mock-jwt-token":
        return {"user_id": DEFAULT_USER_ID}
    return {"user_id": _user_id_from_jwt(token)}


@router.get("/status")
async def integrations_status(user: dict = Depends(require_user)):
    """Return connection status for supported tools."""
    try:
        user_id = user["user_id"]
        gmail_doc = await db_service.get_user_tokens(user_id, "gmail")
        tokens = (gmail_doc or {}).get("tokens") or {}
        gmail_connected = bool(
            gmail_doc
            and gmail_doc.get("connected", True)
            and (tokens.get("refresh_token") or tokens.get("token") or tokens.get("access_token"))
        )
        return {
            "gmail": gmail_connected,
            "slack": False,
            "jira": False,
            "github": False,
            "user_id": user_id,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("integrations status failed")
        raise HTTPException(status_code=500, detail=f"Unable to load integration status: {exc}")


@router.get("/google/login")
async def google_login(
    token: str = Query(..., description="App JWT from AuthGate (localStorage auth_token)"),
):
    """Start Gmail OAuth; bind PKCE + user_id so callback can persist tokens."""
    try:
        user_id = _user_id_from_jwt(token)
        flow = build_auth_flow()
        # Must match an Authorized redirect URI in Google Cloud Console.
        flow.redirect_uri = google_redirect_uri()
        auth_url, state = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            prompt="consent",
        )
        verifier = getattr(flow, "code_verifier", None)
        oauth_state_store[state] = {
            "code_verifier": verifier,
            "user_id": user_id,
            "flow": "gmail",
        }
        logger.info(
            "Gmail OAuth login started user_id=%s redirect_uri=%s",
            user_id,
            flow.redirect_uri,
        )
        redirect = RedirectResponse(url=auth_url, status_code=302)
        if verifier:
            set_pkce_cookie(redirect, COOKIE_GMAIL, state, verifier, user_id=user_id)
        return redirect
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        logger.exception("google login failed")
        raise HTTPException(status_code=500, detail=f"Unable to start Google OAuth: {exc}")


async def complete_gmail_oauth(
    code: Optional[str],
    state: Optional[str],
    error: Optional[str] = None,
    request: Optional[Request] = None,
) -> RedirectResponse:
    """Finish Gmail OAuth (shared by auth callback + integrations callback)."""
    if error:
        logger.warning("Google OAuth error: %s", error)
        return RedirectResponse(url=frontend_tools_url("error"), status_code=302)
    if not code or not state:
        return RedirectResponse(url=frontend_tools_url("error"), status_code=302)

    state_data = oauth_state_store.pop(state, {}) or {}
    user_id = (state_data.get("user_id") or "").strip()
    code_verifier = state_data.get("code_verifier")
    if (not user_id or not code_verifier) and request is not None:
        cookie_pkce = read_pkce_cookie(request, COOKIE_GMAIL, expected_state=state)
        if cookie_pkce:
            code_verifier = code_verifier or cookie_pkce.get("v")
            user_id = user_id or str(cookie_pkce.get("user_id") or "").strip()

    if not user_id or not code_verifier:
        logger.error(
            "OAuth state missing identity/verifier (user_id=%r verifier=%s)",
            user_id,
            bool(code_verifier),
        )
        return RedirectResponse(url=frontend_tools_url("error"), status_code=302)

    try:
        flow = build_auth_flow(state=state)
        flow.redirect_uri = google_redirect_uri()
        flow.code_verifier = code_verifier
        logger.info("Gmail OAuth callback redirect_uri=%s user_id=%s", flow.redirect_uri, user_id)
        flow.fetch_token(code=code)
        creds = flow.credentials
        token_payload = credentials_to_token_dict(creds)
        saved = await db_service.upsert_user_tokens(user_id, token_payload)
        if isinstance(saved, dict) and saved.get("error"):
            logger.error("Failed to persist Google tokens for %s: %s", user_id, saved["error"])
            return RedirectResponse(url=frontend_tools_url("error"), status_code=302)
        logger.info("Gmail tokens saved for user_id=%s", user_id)
        redirect = RedirectResponse(url=frontend_tools_url("success"), status_code=302)
        clear_pkce_cookie(redirect, COOKIE_GMAIL)
        return redirect
    except Exception:
        logger.exception("google callback failed for user_id=%s", user_id)
        return RedirectResponse(url=frontend_tools_url("error"), status_code=302)


@router.get("/google/callback")
async def google_callback(
    request: Request,
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
):
    """Legacy/alternate callback path if Console also lists the integrations URI."""
    return await complete_gmail_oauth(code=code, state=state, error=error, request=request)


@router.post("/google/disconnect")
async def google_disconnect(user: dict = Depends(require_user)):
    """Delete stored Google / Gmail tokens for the current user."""
    try:
        ok = await db_service.delete_user_tokens(user["user_id"], "gmail")
        if not ok:
            raise HTTPException(status_code=500, detail="Failed to disconnect Google account")
        return {"status": "success", "gmail": False, "user_id": user["user_id"]}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("google disconnect failed")
        raise HTTPException(status_code=500, detail=f"Unable to disconnect Google: {exc}")
