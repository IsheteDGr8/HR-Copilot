"""LinkedIn API placeholders registered on FastMCP (credentials via env)."""

from __future__ import annotations

import logging

import httpx

from core.config import get_settings

logger = logging.getLogger(__name__)


def linkedin_post_job(title: str, description: str, salary_range: str) -> dict:
    settings = get_settings()
    if not settings.linkedin_client_id:
        return {
            "ok": False,
            "error": "LINKEDIN_CLIENT_ID is not configured. Job draft was not published.",
            "draft": {"title": title, "description": description, "salary_range": salary_range},
        }
    # Real posting requires a LinkedIn Marketing/Jobs access token stored in Cosmos.
    return {
        "ok": False,
        "error": "LinkedIn job posting is scaffolded; store a member token in Cosmos integrations to enable publish.",
        "draft": {"title": title, "description": description, "salary_range": salary_range},
    }


def linkedin_publish_posting(user_id: str, posting: dict) -> dict:
    """Publish a compliant posting to LinkedIn (RCW 49.58 enforced at publish time).

    Uses a member token stored in Cosmos integrations under `{user_id}:linkedin`.
    When no token is present (expected in local/dev), falls back to mock mode —
    same pattern as the IT dispatcher — so the HITL publish path always completes.
    """
    from tools.compliance_validator import validate_salary_range_text

    title = str(posting.get("title") or posting.get("candidate_name") or "").strip()
    salary_range = str(posting.get("salary_range") or "").strip()
    benefits = str(posting.get("benefits_summary") or "").strip()
    description = str(posting.get("body") or posting.get("letter_markdown") or "").strip()

    # RCW 49.58 gate at publish time.
    check = validate_salary_range_text(salary_range)
    if not check.get("ok"):
        return {"ok": False, "error": check.get("error"), "draft": posting}
    if not benefits:
        return {
            "ok": False,
            "error": "RCW 49.58: a benefits summary is required before publishing.",
            "draft": posting,
        }

    token = ""
    try:
        from tools.azure_cosmos import get_integration_tokens

        doc = get_integration_tokens(user_id, "linkedin")
        tokens = (doc or {}).get("tokens") or {}
        token = tokens.get("token") or tokens.get("access_token") or ""
    except Exception:
        logger.debug("LinkedIn token lookup failed", exc_info=True)

    payload = {
        "title": title,
        "description": description,
        "salary_range": salary_range,
        "benefits": benefits,
        "location": posting.get("location"),
        "job_family": posting.get("job_family"),
        "level": posting.get("level"),
    }

    if not token:
        # Mock sink — mirrors IT_DISPATCH_MODE=mock so recruiting E2E works without LinkedIn OAuth.
        logger.info(
            "MOCK LinkedIn publish for user_id=%s\n%s",
            user_id,
            _format_mock_log(payload),
        )
        return {
            "ok": True,
            "mode": "mock",
            "message": "Simulated LinkedIn post successful.",
            "draft": payload,
        }

    try:
        resp = httpx.post(
            "https://api.linkedin.com/v2/simpleJobPostings",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"title": title, "description": description, "salaryRange": salary_range},
            timeout=30.0,
        )
        if resp.status_code >= 400:
            return {"ok": False, "error": resp.text, "draft": posting}
        return {"ok": True, "mode": "linkedin", "provider": "linkedin", "result": resp.json()}
    except Exception as exc:
        logger.exception("LinkedIn publish failed")
        return {"ok": False, "error": str(exc), "draft": posting}


def _format_mock_log(payload: dict) -> str:
    lines = [
        f"  title: {payload.get('title')}",
        f"  location: {payload.get('location')}",
        f"  salary_range: {payload.get('salary_range')}",
        f"  benefits: {payload.get('benefits')}",
        "  description:",
        *(f"    {ln}" for ln in str(payload.get("description") or "").splitlines()[:40]),
    ]
    return "\n".join(lines)


def register(mcp) -> None:
    @mcp.tool()
    def draft_linkedin_job_posting(title: str, description: str, salary_range: str) -> dict:
        """Prepare (and optionally publish) a LinkedIn job posting. Salary range is required."""
        return linkedin_post_job(title, description, salary_range)
