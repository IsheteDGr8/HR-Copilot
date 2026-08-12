"""Google OAuth helpers for Gmail integration (native, not MCP)."""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow

logger = logging.getLogger(__name__)

GMAIL_SCOPES: List[str] = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
]


def _keys_file_path() -> Path:
    return Path(__file__).resolve().parent.parent / "gcp-oauth.keys.json"


def load_google_client_config() -> Tuple[str, str]:
    """Return (client_id, client_secret) from env or local keys file."""
    client_id = (os.getenv("GOOGLE_CLIENT_ID") or "").strip()
    client_secret = (os.getenv("GOOGLE_CLIENT_SECRET") or "").strip()
    if client_id and client_secret:
        return client_id, client_secret

    keys_path = _keys_file_path()
    if keys_path.is_file():
        try:
            data = json.loads(keys_path.read_text(encoding="utf-8"))
            block = data.get("web") or data.get("installed") or {}
            client_id = (block.get("client_id") or "").strip()
            client_secret = (block.get("client_secret") or "").strip()
            if client_id and client_secret:
                return client_id, client_secret
        except Exception as exc:
            logger.warning("Failed to read %s: %s", keys_path, exc)

    raise ValueError(
        "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and "
        "GOOGLE_CLIENT_SECRET, or provide backend/gcp-oauth.keys.json."
    )


def google_redirect_uri() -> str:
    """Redirect URI for Gmail Tools OAuth.

    Defaults to the same Console-approved URI as login SSO
    (`/api/v1/auth/google/callback`) so Connect Google does not hit
    redirect_uri_mismatch when only that URI is registered.
    """
    return (
        os.getenv("GOOGLE_REDIRECT_URI")
        or os.getenv("GOOGLE_AUTH_REDIRECT_URI")
        or "http://localhost:8000/api/v1/auth/google/callback"
    ).strip().rstrip("/")


def frontend_tools_url(status: str = "success") -> str:
    base = (os.getenv("FRONTEND_URL") or "http://localhost:3000").rstrip("/")
    return f"{base}/tools?status={status}"


def build_auth_flow(state: Optional[str] = None) -> Flow:
    client_id, client_secret = load_google_client_config()
    redirect_uri = google_redirect_uri()
    client_config = {
        "web": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [redirect_uri],
        }
    }
    flow = Flow.from_client_config(
        client_config,
        scopes=GMAIL_SCOPES,
        state=state,
    )
    flow.redirect_uri = redirect_uri
    return flow


def credentials_to_token_dict(creds: Credentials) -> Dict[str, Any]:
    return {
        "service": "gmail",
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri or "https://oauth2.googleapis.com/token",
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": list(creds.scopes or GMAIL_SCOPES),
        "expiry": creds.expiry.isoformat() if creds.expiry else None,
    }


def credentials_from_token_dict(tokens: Dict[str, Any]) -> Credentials:
    client_id, client_secret = load_google_client_config()
    return Credentials(
        token=tokens.get("token") or tokens.get("access_token"),
        refresh_token=tokens.get("refresh_token"),
        token_uri=tokens.get("token_uri") or "https://oauth2.googleapis.com/token",
        client_id=tokens.get("client_id") or client_id,
        client_secret=tokens.get("client_secret") or client_secret,
        scopes=tokens.get("scopes") or GMAIL_SCOPES,
    )


def ensure_fresh_credentials(creds: Credentials) -> Credentials:
    """Refresh access token in-place when expired."""
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
    return creds
