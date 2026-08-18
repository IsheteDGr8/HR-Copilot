"""Google SSO login — issues a JWT for the frontend AuthGate."""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
from urllib.parse import quote

import jwt
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from core.security.pkce_cookie import (
    COOKIE_LOGIN,
    clear_pkce_cookie,
    read_pkce_cookie,
    set_pkce_cookie,
)
from google.auth.transport.requests import AuthorizedSession
from google_auth_oauthlib.flow import Flow

from services.google_oauth import load_google_client_config

# Allow previously-granted scopes (e.g. Gmail) without failing token exchange.
os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

# Temporary in-memory PKCE store: oauth `state` -> `code_verifier`.
oauth_state_store: Dict[str, Optional[str]] = {}

# Must match Google Cloud Console → Credentials → Authorized redirect URIs EXACTLY
# (scheme, host, port, path — no trailing slash).
_DEFAULT_AUTH_REDIRECT_URI = "http://localhost:8000/api/v1/auth/google/callback"
AUTH_REDIRECT_URI = (os.getenv("GOOGLE_AUTH_REDIRECT_URI") or _DEFAULT_AUTH_REDIRECT_URI).strip().rstrip("/")
# Guard against accidental path drift from env typos.
if not AUTH_REDIRECT_URI.endswith("/api/v1/auth/google/callback"):
    logger.warning(
        "GOOGLE_AUTH_REDIRECT_URI=%r does not look like the auth callback; "
        "falling back to %s",
        AUTH_REDIRECT_URI,
        _DEFAULT_AUTH_REDIRECT_URI,
    )
    AUTH_REDIRECT_URI = _DEFAULT_AUTH_REDIRECT_URI

AUTH_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]


def _frontend_url() -> str:
    return (os.getenv("FRONTEND_URL") or "http://localhost:3000").rstrip("/")


def _jwt_secret() -> str:
    secret = (os.getenv("JWT_SECRET") or "").strip()
    if not secret:
        # Dev fallback — set JWT_SECRET in production / Azure.
        secret = "dev-only-hr-copilot-jwt-secret-change-me"
        logger.warning("JWT_SECRET is not set; using insecure development default.")
    return secret


def _build_login_flow(state: Optional[str] = None) -> Flow:
    client_id, client_secret = load_google_client_config()
    client_config = {
        "web": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [AUTH_REDIRECT_URI],
        }
    }
    flow = Flow.from_client_config(
        client_config,
        scopes=AUTH_SCOPES,
        state=state,
    )
    flow.redirect_uri = AUTH_REDIRECT_URI
    return flow


def _mint_jwt(profile: Dict[str, Any]) -> str:
    now = datetime.now(timezone.utc)
    email = (profile.get("email") or "").strip()
    name = (profile.get("name") or profile.get("given_name") or email or "User").strip()
    # Local/dev default: 7 days so tokens don't expire mid-session while building.
    expire_days = int(os.getenv("JWT_EXPIRE_DAYS", "7"))
    payload = {
        "sub": profile.get("id") or email or "unknown",
        "email": email,
        "name": name,
        "picture": profile.get("picture"),
        "iat": now,
        "exp": now + timedelta(days=expire_days),
    }
    return jwt.encode(payload, _jwt_secret(), algorithm="HS256")


@router.get("/google/login")
async def google_login():
    """Start Google SSO and redirect to Google's consent screen."""
    try:
        flow = _build_login_flow()
        flow.redirect_uri = AUTH_REDIRECT_URI
        auth_url, state = flow.authorization_url(
            access_type="online",
            include_granted_scopes="false",
            prompt="select_account",
        )
        verifier = getattr(flow, "code_verifier", None)
        oauth_state_store[state] = verifier
        logger.info("Google login redirect_uri=%s", flow.redirect_uri)
        redirect = RedirectResponse(url=auth_url, status_code=302)
        if verifier:
            # Cookie survives uvicorn --reload / process restart; RAM store does not.
            set_pkce_cookie(redirect, COOKIE_LOGIN, state, verifier)
        return redirect
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        logger.exception("auth google login failed")
        raise HTTPException(status_code=500, detail=f"Unable to start Google login: {exc}")


@router.get("/google/callback")
async def google_callback(
    request: Request,
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
):
    """Handle both login SSO and Gmail Tools OAuth (shared Console redirect URI)."""
    # Gmail Connect stores state in the integrations PKCE store / cookie — dispatch there first.
    if state:
        from api.v1 import integrations as integrations_api
        from core.security.pkce_cookie import COOKIE_GMAIL

        gmail_cookie = read_pkce_cookie(request, COOKIE_GMAIL, expected_state=state)
        if state in integrations_api.oauth_state_store or gmail_cookie:
            return await integrations_api.complete_gmail_oauth(
                code=code, state=state, error=error, request=request
            )

    frontend = _frontend_url()
    if error:
        logger.warning("Google login error: %s", error)
        return RedirectResponse(url=f"{frontend}/chat?auth_error={quote(str(error))}", status_code=302)
    if not code or not state:
        return RedirectResponse(url=f"{frontend}/chat?auth_error=missing_code", status_code=302)

    try:
        flow = _build_login_flow(state=state)
        flow.redirect_uri = AUTH_REDIRECT_URI
        flow.code_verifier = oauth_state_store.pop(state, None)
        if not flow.code_verifier:
            cookie_pkce = read_pkce_cookie(request, COOKIE_LOGIN, expected_state=state)
            flow.code_verifier = (cookie_pkce or {}).get("v")
        if not flow.code_verifier:
            logger.error("Missing PKCE code_verifier for login state=%s", state)
            return RedirectResponse(url=f"{frontend}/chat?auth_error=missing_verifier", status_code=302)

        logger.info("Google login callback redirect_uri=%s", flow.redirect_uri)
        flow.fetch_token(code=code)
        creds = flow.credentials

        session = AuthorizedSession(creds)
        resp = session.get("https://www.googleapis.com/oauth2/v1/userinfo")
        if resp.status_code >= 400:
            logger.error("userinfo failed: %s %s", resp.status_code, resp.text)
            return RedirectResponse(url=f"{frontend}/chat?auth_error=profile_failed", status_code=302)

        profile = resp.json() if hasattr(resp, "json") else {}
        if not isinstance(profile, dict):
            profile = {}

        token = _mint_jwt(profile)
        redirect = RedirectResponse(url=f"{frontend}/chat?token={quote(token)}", status_code=302)
        clear_pkce_cookie(redirect, COOKIE_LOGIN)
        return redirect
    except Exception:
        oauth_state_store.pop(state, None)
        logger.exception("auth google callback failed")
        return RedirectResponse(url=f"{frontend}/chat?auth_error=callback_failed", status_code=302)
