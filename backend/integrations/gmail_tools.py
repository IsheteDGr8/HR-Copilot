"""Gmail API tools registered on the local FastMCP server."""

from __future__ import annotations

import base64
import logging
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List, Optional, Tuple

logger = logging.getLogger(__name__)


def _gmail_service(user_id: str):
    from core.agent.user_context import get_current_user_id
    from core.auth.google_oauth import (
        credentials_from_token_dict,
        ensure_fresh_credentials,
    )
    from tools.azure_cosmos import get_integration_tokens, upsert_integration_tokens

    uid = user_id or get_current_user_id()
    doc = get_integration_tokens(uid, "gmail")
    tokens = (doc or {}).get("tokens") or {}
    if not tokens:
        raise RuntimeError(
            "Gmail is not connected. Open the Tools tab and connect Google first."
        )
    creds = ensure_fresh_credentials(credentials_from_token_dict(tokens))
    from googleapiclient.discovery import build

    svc = build("gmail", "v1", credentials=creds, cache_discovery=False)
    try:
        from core.auth.google_oauth import credentials_to_token_dict

        upsert_integration_tokens(uid, "gmail", credentials_to_token_dict(creds))
    except Exception:
        logger.debug("Could not persist refreshed Gmail tokens", exc_info=True)
    return svc


def build_mixed_message(
    to: str,
    subject: str,
    body: str,
    attachments: Optional[List[Tuple[str, bytes]]] = None,
    html: Optional[str] = None,
) -> str:
    """MIMEMultipart('mixed') with optional HTML alternative and PDF attachments."""
    msg = MIMEMultipart("mixed")
    msg["To"] = to
    msg["Subject"] = subject
    alt = MIMEMultipart("alternative")
    alt.attach(MIMEText(body, "plain", "utf-8"))
    if html:
        alt.attach(MIMEText(html, "html", "utf-8"))
    msg.attach(alt)
    for filename, blob in attachments or []:
        part = MIMEApplication(blob, _subtype="pdf")
        part.add_header("Content-Disposition", "attachment", filename=filename)
        part.add_header("Content-Type", "application/pdf")
        msg.attach(part)
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")
    return raw


def gmail_send(
    to: str,
    subject: str,
    body: str,
    user_id: str = "",
    attachments: Optional[List[Tuple[str, bytes]]] = None,
    html: Optional[str] = None,
) -> dict:
    service = _gmail_service(user_id)
    raw = build_mixed_message(to, subject, body, attachments, html=html)
    sent = (
        service.users()
        .messages()
        .send(userId="me", body={"raw": raw})
        .execute()
    )
    return {"ok": True, "id": sent.get("id"), "provider": "gmail"}


def register(mcp) -> None:
    @mcp.tool()
    def send_gmail_message(to: str, subject: str, body: str, user_id: str = "") -> dict:
        """Send email via the signed-in user's Gmail API (no blob hosting links required)."""
        return gmail_send(to=to, subject=subject, body=body, user_id=user_id)
