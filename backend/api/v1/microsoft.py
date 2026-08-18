"""Microsoft login/callback — stores Graph tokens in Cosmos integrations."""

from __future__ import annotations

import logging
import secrets
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from core.auth.msal_auth import (
    acquire_obo_token,
    build_auth_url,
    exchange_auth_code,
    token_payload_for_cosmos,
)
from core.config import get_settings
from core.security.jwt_auth import decode_app_jwt, verify_jwt
from tools.azure_cosmos import get_integration_tokens, upsert_integration_tokens

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/auth", tags=["auth-microsoft"])

# Temporary in-memory map: MSAL `state` -> app user_id, so callback stores tokens
# under the same identity the chat/execution layer uses for _graph_token(user_id).
_state_user_map: dict[str, str] = {}


class OboRequest(BaseModel):
    user_assertion: str


def _app_user_from_token(token: str | None) -> str | None:
    if not token:
        return None
    try:
        return (decode_app_jwt(token) or {}).get("user_id")
    except Exception:
        return None


@router.get("/microsoft/config")
async def microsoft_config():
    """Public preflight: whether MSAL env vars are present (no secrets returned)."""
    settings = get_settings()
    configured = bool(
        settings.msal_client_id and settings.msal_client_secret and settings.msal_tenant_id
    )
    return {
        "configured": configured,
        "redirect_uri": settings.msal_redirect_uri,
        "missing": [
            name
            for name, ok in (
                ("MSAL_CLIENT_ID", bool(settings.msal_client_id)),
                ("MSAL_CLIENT_SECRET", bool(settings.msal_client_secret)),
                ("MSAL_TENANT_ID", bool(settings.msal_tenant_id)),
            )
            if not ok
        ],
    }


@router.get("/microsoft/login")
async def microsoft_login(token: str | None = Query(None)):
    try:
        state = secrets.token_urlsafe(16)
        app_user = _app_user_from_token(token)
        if app_user:
            _state_user_map[state] = app_user
        url = build_auth_url(state=state)
        return RedirectResponse(url=url, status_code=302)
    except Exception as exc:
        logger.exception("MSAL login failed")
        settings = get_settings()
        return RedirectResponse(
            url=f"{settings.frontend_url}/tools?status=error&provider=microsoft&detail={quote(str(exc))}",
            status_code=302,
        )


@router.get("/microsoft/callback")
async def microsoft_callback(
    code: str | None = Query(None),
    error: str | None = Query(None),
    state: str | None = Query(None),
):
    settings = get_settings()
    frontend = settings.frontend_url
    if error or not code:
        return RedirectResponse(url=f"{frontend}/tools?status=error", status_code=302)
    try:
        result = exchange_auth_code(code)
        # Store under the app user_id if we threaded it through login; otherwise
        # fall back to the id_token email so tokens are still persisted.
        stored_user = _state_user_map.pop(state, "") if state else ""
        if not stored_user:
            import jwt as pyjwt

            stored_user = settings.default_user_id
            id_token = result.get("id_token")
            if id_token:
                try:
                    claims = pyjwt.decode(id_token, options={"verify_signature": False})
                    stored_user = (
                        claims.get("preferred_username") or claims.get("email") or stored_user
                    ).strip()
                except Exception:
                    pass
        upsert_integration_tokens(stored_user, "microsoft_graph", token_payload_for_cosmos(result))
        return RedirectResponse(url=f"{frontend}/tools?status=success&provider=microsoft", status_code=302)
    except Exception:
        logger.exception("MSAL callback failed")
        return RedirectResponse(url=f"{frontend}/tools?status=error&provider=microsoft", status_code=302)


@router.post("/microsoft/obo")
async def microsoft_obo(body: OboRequest, user: dict = Depends(verify_jwt)):
    """On-Behalf-Of exchange: trade a frontend-held MS user token for Graph tokens.

    Used when the SPA acquires an MS access token via MSAL.js and delegates it to
    the backend instead of the redirect auth-code flow.
    """
    user_id = user.get("user_id") or get_settings().default_user_id
    result = acquire_obo_token(body.user_assertion)
    upsert_integration_tokens(user_id, "microsoft_graph", token_payload_for_cosmos(result))
    return {"ok": True, "provider": "microsoft_graph", "user_id": user_id}


@router.get("/microsoft/status")
async def microsoft_status(user: dict = Depends(verify_jwt)):
    user_id = user.get("user_id") or get_settings().default_user_id
    doc = get_integration_tokens(user_id, "microsoft_graph")
    tokens = (doc or {}).get("tokens") or {}
    connected = bool(
        doc
        and doc.get("connected", True)
        and (tokens.get("refresh_token") or tokens.get("token") or tokens.get("access_token"))
    )
    return {"microsoft": connected, "user_id": user_id}
