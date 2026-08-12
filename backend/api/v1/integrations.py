"""Native Google / Gmail OAuth integration endpoints."""

from __future__ import annotations

import logging
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header, Query
from fastapi.responses import RedirectResponse

from services.db import db_service
from services.google_oauth import (
    build_auth_flow,
    credentials_to_token_dict,
    frontend_tools_url,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/integrations", tags=["integrations"])

DEFAULT_USER_ID = os.getenv("DEFAULT_USER_ID", "test_user")

# Temporary in-memory PKCE store: oauth `state` -> `code_verifier`.
# Required because login and callback construct separate Flow instances.
oauth_state_store: dict = {}


async def optional_user(authorization: Optional[str] = Header(None)) -> dict:
    """Resolve user for OAuth browser redirects (Bearer optional)."""
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()
        if token:
            return {"user_id": DEFAULT_USER_ID}
    return {"user_id": DEFAULT_USER_ID}


async def require_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header missing")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header format")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Token missing")
    return {"user_id": DEFAULT_USER_ID}


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
        }
    except Exception as exc:
        logger.exception("integrations status failed")
        raise HTTPException(status_code=500, detail=f"Unable to load integration status: {exc}")


@router.get("/google/login")
async def google_login(
    user: dict = Depends(optional_user),
    user_id: Optional[str] = Query(None, description="Optional override for local/dev"),
):
    """Start Google OAuth and redirect the browser to Google's consent screen."""
    try:
        uid = (user_id or user.get("user_id") or DEFAULT_USER_ID).strip()
        flow = build_auth_flow(state=uid)
        auth_url, state = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            prompt="consent",
        )
        oauth_state_store[state] = getattr(flow, "code_verifier", None)
        return RedirectResponse(url=auth_url, status_code=302)
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        logger.exception("google login failed")
        raise HTTPException(status_code=500, detail=f"Unable to start Google OAuth: {exc}")


@router.get("/google/callback")
async def google_callback(
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
):
    """Exchange the authorization code, persist tokens, redirect to /tools."""
    if error:
        logger.warning("Google OAuth error: %s", error)
        return RedirectResponse(url=frontend_tools_url("error"), status_code=302)
    if not code or not state:
        return RedirectResponse(url=frontend_tools_url("error"), status_code=302)

    user_id = state.strip() or DEFAULT_USER_ID
    try:
        flow = build_auth_flow(state=state)
        flow.code_verifier = oauth_state_store.get(state)
        oauth_state_store.pop(state, None)
        if not flow.code_verifier:
            logger.error("Missing PKCE code_verifier for OAuth state=%s", state)
            return RedirectResponse(url=frontend_tools_url("error"), status_code=302)

        flow.fetch_token(code=code)
        creds = flow.credentials
        token_payload = credentials_to_token_dict(creds)
        saved = await db_service.upsert_user_tokens(user_id, token_payload)
        if isinstance(saved, dict) and saved.get("error"):
            logger.error("Failed to persist Google tokens: %s", saved["error"])
            return RedirectResponse(url=frontend_tools_url("error"), status_code=302)
        return RedirectResponse(url=frontend_tools_url("success"), status_code=302)
    except Exception:
        oauth_state_store.pop(state, None)
        logger.exception("google callback failed")
        return RedirectResponse(url=frontend_tools_url("error"), status_code=302)


@router.post("/google/disconnect")
async def google_disconnect(user: dict = Depends(require_user)):
    """Delete stored Google / Gmail tokens for the current user."""
    try:
        ok = await db_service.delete_user_tokens(user["user_id"], "gmail")
        if not ok:
            raise HTTPException(status_code=500, detail="Failed to disconnect Google account")
        return {"status": "success", "gmail": False}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("google disconnect failed")
        raise HTTPException(status_code=500, detail=f"Unable to disconnect Google: {exc}")
