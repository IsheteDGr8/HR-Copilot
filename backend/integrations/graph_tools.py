"""Microsoft Graph tools (Teams / Outlook) using MSAL tokens from Cosmos."""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

import httpx

logger = logging.getLogger(__name__)

GRAPH = "https://graph.microsoft.com/v1.0"


_EXPIRY_SKEW_SECONDS = 120


def _graph_token(user_id: str, *, force_refresh: bool = False) -> str:
    """Return a valid Graph access token, refreshing proactively or on demand.

    Refreshes when the cached token is missing, near expiry, or when the caller
    forces it after receiving a 401.
    """
    import time

    from core.auth.msal_auth import refresh_with_refresh_token, token_payload_for_cosmos
    from tools.azure_cosmos import get_integration_tokens, upsert_integration_tokens

    doc = get_integration_tokens(user_id, "microsoft_graph")
    tokens = (doc or {}).get("tokens") or {}
    access = tokens.get("token") or tokens.get("access_token")
    refresh = tokens.get("refresh_token")
    expires_at = tokens.get("expires_at")

    near_expiry = (
        isinstance(expires_at, (int, float)) and time.time() >= (expires_at - _EXPIRY_SKEW_SECONDS)
    )
    needs_refresh = force_refresh or near_expiry or not access

    if needs_refresh and refresh:
        result = refresh_with_refresh_token(refresh)
        upsert_integration_tokens(user_id, "microsoft_graph", token_payload_for_cosmos(result))
        return result["access_token"]
    if access:
        return access
    raise RuntimeError(
        "Microsoft Graph is not connected. Complete MSAL login so tokens are stored in Cosmos."
    )


def _graph_request(
    user_id: str,
    method: str,
    path: str,
    *,
    headers: Optional[Dict[str, str]] = None,
    **kwargs: Any,
) -> httpx.Response:
    """Issue a Graph request, transparently refreshing the token once on 401."""
    def _send(token: str) -> httpx.Response:
        merged = {"Authorization": f"Bearer {token}", **(headers or {})}
        return httpx.request(method, f"{GRAPH}{path}", headers=merged, timeout=30.0, **kwargs)

    resp = _send(_graph_token(user_id))
    if resp.status_code == 401:
        logger.info("Graph 401 for user_id=%s; forcing token refresh and retrying", user_id)
        resp = _send(_graph_token(user_id, force_refresh=True))
    return resp


def graph_send_mail(
    user_id: str,
    to: str,
    subject: str,
    body: str,
    attachments: Optional[list] = None,
) -> dict:
    message: Dict[str, Any] = {
        "subject": subject,
        "body": {"contentType": "Text", "content": body},
        "toRecipients": [{"emailAddress": {"address": to}}],
    }
    if attachments:
        import base64

        encoded = []
        for item in attachments:
            if isinstance(item, (tuple, list)) and len(item) == 2:
                filename, blob = item
            else:
                continue
            encoded.append(
                {
                    "@odata.type": "#microsoft.graph.fileAttachment",
                    "name": filename,
                    "contentType": "application/pdf",
                    "contentBytes": base64.b64encode(blob).decode("ascii"),
                }
            )
        if encoded:
            message["attachments"] = encoded
    payload = {"message": message, "saveToSentItems": True}
    resp = _graph_request(
        user_id,
        "POST",
        "/me/sendMail",
        headers={"Content-Type": "application/json"},
        json=payload,
    )
    if resp.status_code >= 400:
        return {"ok": False, "error": resp.text}
    return {"ok": True, "provider": "microsoft_graph"}


def graph_post_teams_message(user_id: str, team_id: str, channel_id: str, text: str) -> dict:
    resp = _graph_request(
        user_id,
        "POST",
        f"/teams/{team_id}/channels/{channel_id}/messages",
        json={"body": {"content": text}},
    )
    if resp.status_code >= 400:
        return {"ok": False, "error": resp.text}
    return {"ok": True, "provider": "microsoft_graph", "result": resp.json()}


def graph_post_chat_message(user_id: str, chat_id: str, text: str) -> dict:
    """Post a message to a 1:1 or group chat (Graph Chat.Send)."""
    resp = _graph_request(
        user_id,
        "POST",
        f"/chats/{chat_id}/messages",
        json={"body": {"content": text}},
    )
    if resp.status_code >= 400:
        return {"ok": False, "error": resp.text}
    return {"ok": True, "provider": "microsoft_graph", "result": resp.json()}


def graph_search_directory(user_id: str, query: str) -> dict:
    resp = _graph_request(
        user_id,
        "GET",
        "/users",
        params={"$search": f'"displayName:{query}"', "$top": "10"},
        headers={"ConsistencyLevel": "eventual"},
    )
    if resp.status_code >= 400:
        return {"ok": False, "error": resp.text}
    return {"ok": True, "users": resp.json().get("value") or []}


def register(mcp) -> None:
    @mcp.tool()
    def send_outlook_mail(to: str, subject: str, body: str, user_id: str = "") -> dict:
        """Send mail through Microsoft Graph (Outlook) using stored MSAL tokens."""
        from core.agent.user_context import get_current_user_id

        return graph_send_mail(user_id or get_current_user_id(), to, subject, body)

    @mcp.tool()
    def post_teams_channel_message(team_id: str, channel_id: str, text: str, user_id: str = "") -> dict:
        """Post a message to a Teams channel via Microsoft Graph."""
        from core.agent.user_context import get_current_user_id

        return graph_post_teams_message(user_id or get_current_user_id(), team_id, channel_id, text)

    @mcp.tool()
    def search_microsoft_directory(query: str, user_id: str = "") -> dict:
        """Search the Microsoft 365 tenant directory (Graph /users)."""
        from core.agent.user_context import get_current_user_id

        return graph_search_directory(user_id or get_current_user_id(), query)
