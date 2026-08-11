"""Native HR execution tools backed by Azure Cosmos DB and Azure AI Search.

Registered automatically via `@agent_tool` when this module is imported by
`core.agent.loop`.
"""

from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone
from typing import Any, Optional

from azure.core.credentials import AzureKeyCredential
from azure.search.documents import SearchClient

from core.agent.registry import agent_tool
from services.db import db_service

_NO_POLICY_RESULTS = "No relevant policy documents found for this query."
_HR_POLICIES_INDEX = "hr-policies-index"

_search_client: Optional[SearchClient] = None


def _error(message: str, **extra: Any) -> dict:
    return {"error": message, **extra}


def _get_search_client() -> Optional[SearchClient]:
    """Lazy Azure AI Search client for the HR policies index."""
    global _search_client
    if _search_client is not None:
        return _search_client

    endpoint = (
        os.getenv("AZURE_SEARCH_ENDPOINT")
        or os.getenv("SEARCH_ENDPOINT")
        or ""
    ).strip()
    key = (
        os.getenv("AZURE_SEARCH_KEY")
        or os.getenv("SEARCH_KEY")
        or ""
    ).strip()
    index_name = (
        os.getenv("AZURE_SEARCH_INDEX")
        or os.getenv("SEARCH_INDEX_NAME")
        or _HR_POLICIES_INDEX
    ).strip()

    if not endpoint or not key:
        return None

    _search_client = SearchClient(
        endpoint=endpoint,
        index_name=index_name,
        credential=AzureKeyCredential(key),
    )
    return _search_client


def _extract_content(doc: Any) -> str:
    """Pull the primary text field from a search hit."""
    if doc is None:
        return ""
    for field in ("content", "chunk", "text", "body", "passage"):
        value = doc.get(field) if hasattr(doc, "get") else None
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


@agent_tool
async def search_hr_policies(query: str) -> str:
    """Search HR policy documents (benefits, compliance, handbook, leave, etc.)
    via Azure AI Search RAG. Use for complex policy questions before answering.
    Returns concatenated excerpts from the top matching documents.
    """
    q = (query or "").strip()
    if not q:
        return _NO_POLICY_RESULTS

    try:
        client = _get_search_client()
        if client is None:
            # Local / mock mode without Search credentials.
            if os.getenv("USE_MOCK_AZURE", "false").lower() == "true":
                return (
                    "Mock PTO Policy: Employees accrue 20 days of PTO per year. "
                    "Requests should be submitted at least two weeks in advance when possible. "
                    "Unused PTO may carry over up to 5 days into the next calendar year.\n\n"
                    "Mock Benefits Policy: Full-time employees are eligible for medical, dental, "
                    "and vision coverage on the first of the month following 30 days of employment."
                )
            return _NO_POLICY_RESULTS

        def _run_search() -> list[str]:
            results = client.search(search_text=q, top=3)
            snippets: list[str] = []
            for doc in results:
                text = _extract_content(doc)
                if text:
                    snippets.append(text)
            return snippets

        snippets = await asyncio.to_thread(_run_search)
        if not snippets:
            return _NO_POLICY_RESULTS
        return "\n\n---\n\n".join(snippets)
    except Exception:
        return _NO_POLICY_RESULTS


@agent_tool
async def trigger_onboarding(employee_name: str, role: str, department: str) -> dict:
    """Start onboarding for a new hire. Creates an onboarding checklist in Cosmos DB
    with pending IT provisioning and document-signing items. Use when HR asks to
    onboard someone or kick off new-hire setup.
    """
    try:
        name = (employee_name or "").strip()
        role_val = (role or "").strip()
        dept = (department or "").strip()
        if not name:
            return _error("employee_name is required and cannot be empty.")
        if not role_val:
            return _error("role is required and cannot be empty.")
        if not dept:
            return _error("department is required and cannot be empty.")

        record = await db_service.create_onboarding_checklist(
            employee_name=name,
            role=role_val,
            department=dept,
        )
        if "error" in record:
            return record

        return {
            "ok": True,
            "message": f"Onboarding started for {name}.",
            "employee_id": record.get("employee_id") or record.get("id"),
            "employee_name": record.get("employee_name"),
            "role": record.get("role"),
            "department": record.get("department"),
            "status": record.get("status"),
            "checklist": record.get("checklist"),
            "created_at": record.get("created_at"),
        }
    except Exception as exc:
        return _error(
            f"Failed to create onboarding checklist: {exc}",
            hint="Check employee_name / role / department and Cosmos connectivity.",
        )


@agent_tool
async def update_provisioning_status(employee_id: str, item_key: str, status: str) -> dict:
    """Update a single onboarding checklist item (e.g. mark IT provisioning Completed).
    item_key examples: it_provisioning, laptop_setup, email_account, document_signing,
    benefits_enrollment. status examples: Pending, In Progress, Completed.
    """
    try:
        record = await db_service.update_checklist_item(
            employee_id=employee_id,
            item_key=item_key,
            status=status,
        )
        if "error" in record:
            return record

        return {
            "ok": True,
            "message": f"Updated '{item_key}' to '{status}' for employee {employee_id}.",
            "employee_id": record.get("employee_id") or record.get("id"),
            "employee_name": record.get("employee_name"),
            "status": record.get("status"),
            "checklist": record.get("checklist"),
            "updated_at": record.get("updated_at"),
        }
    except Exception as exc:
        return _error(
            f"Failed to update provisioning status: {exc}",
            hint="Verify employee_id, item_key, and status values.",
        )


@agent_tool
async def generate_offer_letter(candidate_name: str, salary: int, start_date: str) -> dict:
    """Draft an offer letter for a candidate, persist it to the Cosmos documents
    container, and return a structured document payload for review.
    """
    try:
        name = (candidate_name or "").strip()
        date_val = (start_date or "").strip()
        if not name:
            return _error("candidate_name is required and cannot be empty.")
        if salary is None:
            return _error("salary is required (integer, annual USD).")
        try:
            salary_int = int(salary)
        except (TypeError, ValueError):
            return _error("salary must be an integer (annual USD), e.g. 120000.")
        if salary_int <= 0:
            return _error("salary must be a positive integer.")
        if not date_val:
            return _error("start_date is required (ISO date string, e.g. '2026-09-01').")

        drafted_on = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        document_body = {
            "title": f"Offer Letter — {name}",
            "type": "offer_letter",
            "candidate_name": name,
            "salary": salary_int,
            "salary_display": f"${salary_int:,} USD / year",
            "start_date": date_val,
            "drafted_on": drafted_on,
            "sections": [
                {
                    "heading": "Offer",
                    "body": (
                        f"Dear {name},\n\n"
                        f"We are pleased to offer you employment with a starting annual "
                        f"salary of ${salary_int:,}, effective {date_val}."
                    ),
                },
                {
                    "heading": "Next steps",
                    "body": (
                        "Please review this draft, then sign and return the formal offer "
                        "package. Onboarding will begin once the signed documents are received."
                    ),
                },
            ],
            "status": "draft",
        }

        saved = await db_service.save_document(
            {
                "type": "offer_letter",
                "candidate_name": name,
                "salary": salary_int,
                "start_date": date_val,
                "status": "draft",
                "content": document_body,
            }
        )
        if "error" in saved:
            return saved

        return {
            "ok": True,
            "message": f"Offer letter drafted for {name}.",
            "document_id": saved.get("id"),
            "candidate_name": name,
            "salary": salary_int,
            "start_date": date_val,
            "status": saved.get("status", "draft"),
            "document": document_body,
        }
    except Exception as exc:
        return _error(
            f"Failed to generate offer letter: {exc}",
            hint="Check candidate_name, salary (int), and start_date (YYYY-MM-DD).",
        )
