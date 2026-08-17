"""Microsoft Identity Platform (MSAL) — authorization-code + OBO helpers."""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


GRAPH_DEFAULT_SCOPES = [
    "https://graph.microsoft.com/User.Read",
    "https://graph.microsoft.com/Mail.Send",
    "https://graph.microsoft.com/Chat.ReadWrite",
]


def _msal_app():
    from core.config import get_settings

    settings = get_settings()
    if not (settings.msal_client_id and settings.msal_client_secret and settings.msal_tenant_id):
        raise ValueError(
            "MSAL is not configured. Set MSAL_CLIENT_ID, MSAL_CLIENT_SECRET, and MSAL_TENANT_ID."
        )
    import msal

    authority = f"https://login.microsoftonline.com/{settings.msal_tenant_id}"
    return msal.ConfidentialClientApplication(
        client_id=settings.msal_client_id,
        client_credential=settings.msal_client_secret,
        authority=authority,
    )


def build_auth_url(state: str, scopes: Optional[List[str]] = None) -> str:
    from core.config import get_settings

    settings = get_settings()
    app = _msal_app()
    return app.get_authorization_request_url(
        scopes=scopes or settings.msal_graph_scopes or GRAPH_DEFAULT_SCOPES,
        state=state,
        redirect_uri=settings.msal_redirect_uri,
        prompt="select_account",
    )


def exchange_auth_code(code: str, scopes: Optional[List[str]] = None) -> Dict[str, Any]:
    """Exchange an auth code from the frontend/Microsoft redirect for tokens."""
    from core.config import get_settings

    settings = get_settings()
    app = _msal_app()
    result = app.acquire_token_by_authorization_code(
        code=code,
        scopes=scopes or settings.msal_graph_scopes or GRAPH_DEFAULT_SCOPES,
        redirect_uri=settings.msal_redirect_uri,
    )
    if not result or result.get("error"):
        raise ValueError(result.get("error_description") or result.get("error") or "MSAL token exchange failed")
    return result


def acquire_obo_token(user_assertion: str, scopes: Optional[List[str]] = None) -> Dict[str, Any]:
    """On-Behalf-Of: exchange a user access token for a Graph token."""
    from core.config import get_settings

    settings = get_settings()
    app = _msal_app()
    result = app.acquire_token_on_behalf_of(
        user_assertion=user_assertion,
        scopes=scopes or settings.msal_graph_scopes or GRAPH_DEFAULT_SCOPES,
    )
    if not result or result.get("error"):
        raise ValueError(result.get("error_description") or result.get("error") or "MSAL OBO failed")
    return result


def acquire_silent(account: Any, scopes: Optional[List[str]] = None) -> Optional[Dict[str, Any]]:
    from core.config import get_settings

    settings = get_settings()
    app = _msal_app()
    result = app.acquire_token_silent(
        scopes=scopes or settings.msal_graph_scopes or GRAPH_DEFAULT_SCOPES,
        account=account,
    )
    return result


def refresh_with_refresh_token(refresh_token: str, scopes: Optional[List[str]] = None) -> Dict[str, Any]:
    from core.config import get_settings

    settings = get_settings()
    app = _msal_app()
    result = app.acquire_token_by_refresh_token(
        refresh_token=refresh_token,
        scopes=scopes or settings.msal_graph_scopes or GRAPH_DEFAULT_SCOPES,
    )
    if not result or result.get("error"):
        raise ValueError(result.get("error_description") or result.get("error") or "MSAL refresh failed")
    return result


def token_payload_for_cosmos(result: Dict[str, Any], service: str = "microsoft_graph") -> Dict[str, Any]:
    import time

    expires_in = result.get("expires_in")
    obtained_at = int(time.time())
    expires_at = obtained_at + int(expires_in) if expires_in is not None else None
    return {
        "service": service,
        "token": result.get("access_token"),
        "refresh_token": result.get("refresh_token"),
        "id_token": result.get("id_token"),
        "expires_in": expires_in,
        "obtained_at": obtained_at,
        "expires_at": expires_at,
        "token_type": result.get("token_type"),
        "scope": result.get("scope"),
        "client_info": result.get("client_info"),
    }
