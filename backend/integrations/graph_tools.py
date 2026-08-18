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


def find_calendar_availability(
    interviewer_emails: Optional[list] = None,
    *,
    days_ahead: int = 5,
    slot_minutes: int = 60,
) -> dict:
    """Return mock available interview slots (MSAL Graph calendar blocked in local/dev)."""
    from datetime import datetime, timedelta, timezone

    interviewers = [str(e).strip() for e in (interviewer_emails or []) if str(e).strip()]
    if not interviewers:
        interviewers = ["hiring.manager@company.com", "recruiter@company.com"]

    start = datetime.now(timezone.utc).replace(hour=16, minute=0, second=0, microsecond=0)
    # Prefer next weekday 9:00 / 14:00 local-ish UTC slots.
    slots = []
    day = start
    while len(slots) < max(3, days_ahead) and len(slots) < 8:
        day += timedelta(days=1)
        if day.weekday() >= 5:
            continue
        for hour in (16, 21):  # ~9am / 2pm PT-ish in UTC
            begin = day.replace(hour=hour, minute=0)
            end = begin + timedelta(minutes=slot_minutes)
            slots.append(
                {
                    "start": begin.isoformat(),
                    "end": end.isoformat(),
                    "interviewers": interviewers,
                    "label": begin.strftime("%a %b %d, %H:%M UTC"),
                }
            )
            if len(slots) >= 6:
                break
    logger.info("MOCK calendar availability for %s → %d slots", interviewers, len(slots))
    return {
        "ok": True,
        "mode": "mock",
        "slots": slots,
        "message": "Mock availability (Microsoft Graph calendar not connected).",
    }


def schedule_interview_event(
    *,
    candidate_name: str,
    candidate_email: str = "",
    interviewer_emails: Optional[list] = None,
    start: str = "",
    end: str = "",
    job_role: str = "",
    requisition_id: str = "",
    user_id: str = "",
) -> dict:
    """Log a mock Outlook/Teams calendar invite (real Graph blocked without MSAL)."""
    avail = find_calendar_availability(interviewer_emails)
    slot = (avail.get("slots") or [{}])[0]
    begin = start or slot.get("start") or ""
    finish = end or slot.get("end") or ""
    meeting_link = "https://teams.microsoft.com/mock-link"
    payload = {
        "candidate_name": candidate_name,
        "candidate_email": candidate_email,
        "interviewers": interviewer_emails or slot.get("interviewers"),
        "start": begin,
        "end": finish,
        "job_role": job_role,
        "requisition_id": requisition_id,
        "meeting_link": meeting_link,
        "organizer_user_id": user_id,
    }
    logger.info(
        "MOCK Outlook calendar invite\n  candidate=%s\n  start=%s\n  end=%s\n  link=%s\n  interviewers=%s",
        candidate_name,
        begin,
        finish,
        meeting_link,
        payload["interviewers"],
    )
    return {
        "ok": True,
        "mode": "mock",
        "meeting_link": meeting_link,
        "event": payload,
        "message": "Simulated Outlook calendar invite successful.",
    }


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

    @mcp.tool()
    def find_interview_availability(interviewer_emails: str = "", days_ahead: int = 5) -> dict:
        """Find (mock) calendar availability for interviewers."""
        emails = [e.strip() for e in interviewer_emails.split(",") if e.strip()]
        return find_calendar_availability(emails or None, days_ahead=days_ahead)

    @mcp.tool()
    def schedule_interview(
        candidate_name: str,
        candidate_email: str = "",
        interviewer_emails: str = "",
        start: str = "",
        end: str = "",
        job_role: str = "",
        user_id: str = "",
    ) -> dict:
        """Schedule a (mock) Outlook/Teams interview invite."""
        from core.agent.user_context import get_current_user_id

        emails = [e.strip() for e in interviewer_emails.split(",") if e.strip()]
        return schedule_interview_event(
            candidate_name=candidate_name,
            candidate_email=candidate_email,
            interviewer_emails=emails or None,
            start=start,
            end=end,
            job_role=job_role,
            user_id=user_id or get_current_user_id(),
        )
