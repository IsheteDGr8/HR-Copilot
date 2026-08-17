"""Policy document search for the Helpdesk worker.

Order: Azure AI Search (if configured) → Blob PDF RAG (`policies/`) → keyword mock.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

_NO_POLICY = "No relevant policy documents found for this query."
_HR_POLICIES_INDEX = "hr-policies-index"

_MOCK_SNIPPETS = {
    "pto": (
        "PTO Policy: Full-time employees accrue 20 days of PTO per year. "
        "Requests should be submitted at least two weeks in advance when possible. "
        "Unused PTO may carry over up to 5 days into the next calendar year."
    ),
    "leave": (
        "Leave Policy: Parental leave, medical leave, and unpaid leave of absence "
        "are governed by the employee handbook. Contact HR for eligibility and forms."
    ),
    "benefits": (
        "Benefits Policy: Full-time employees are eligible for medical, dental, and "
        "vision coverage on the first of the month following 30 days of employment. "
        "401(k) enrollment is available after 90 days with employer match."
    ),
    "remote": (
        "Hybrid / Remote Work Policy: Roles marked hybrid may work remotely up to "
        "3 days per week with manager approval. Fully remote roles require VP sign-off."
    ),
    "default": (
        "Employee Handbook (excerpt): Employees should raise HR questions through "
        "the HR helpdesk. Managers escalate sensitive matters to People Ops. "
        "Anti-harassment and equal opportunity policies apply to all workers in Washington."
    ),
}


def _pick_mock(query: str) -> str:
    q = (query or "").lower()
    if any(k in q for k in ("pto", "vacation", "time off", "time-off")):
        return _MOCK_SNIPPETS["pto"]
    if any(k in q for k in ("leave", "parental", "fmla", "medical leave")):
        return _MOCK_SNIPPETS["leave"]
    if any(k in q for k in ("benefit", "dental", "medical", "401", "insurance")):
        return _MOCK_SNIPPETS["benefits"]
    if any(k in q for k in ("remote", "hybrid", "wfh", "work from home")):
        return _MOCK_SNIPPETS["remote"]
    return _MOCK_SNIPPETS["default"]


def _azure_search(query: str, top: int) -> Dict[str, Any] | None:
    endpoint = (os.getenv("AZURE_SEARCH_ENDPOINT") or os.getenv("SEARCH_ENDPOINT") or "").strip()
    key = (os.getenv("AZURE_SEARCH_KEY") or os.getenv("SEARCH_KEY") or "").strip()
    index_name = (
        os.getenv("AZURE_SEARCH_INDEX") or os.getenv("SEARCH_INDEX_NAME") or _HR_POLICIES_INDEX
    ).strip()
    if not endpoint or not key:
        return None
    try:
        from azure.core.credentials import AzureKeyCredential
        from azure.search.documents import SearchClient

        client = SearchClient(
            endpoint=endpoint,
            index_name=index_name,
            credential=AzureKeyCredential(key),
        )
        results = client.search(search_text=query, top=top)
        excerpts: List[dict] = []
        for doc in results:
            snippet = ""
            for field in ("content", "chunk", "text", "body", "passage"):
                value = doc.get(field) if hasattr(doc, "get") else None
                if isinstance(value, str) and value.strip():
                    snippet = value.strip()
                    break
            if not snippet:
                continue
            excerpts.append(
                {
                    "title": str(doc.get("title") or doc.get("metadata_storage_name") or "Policy"),
                    "snippet": snippet[:1200],
                }
            )
        if not excerpts:
            return None
        text = "\n\n---\n\n".join(f"{e['title']}: {e['snippet']}" for e in excerpts)
        return {"ok": True, "mode": "azure_search", "excerpts": excerpts, "text": text}
    except Exception as exc:
        logger.debug("Azure AI Search failed: %s", exc, exc_info=True)
        return None


def search_corporate_policies(query: str, *, top: int = 3) -> Dict[str, Any]:
    """Public alias used by Helpdesk — prefers Blob RAG, then Azure Search, then mock."""
    return search_policy_documents(query, top=top)


def search_policy_documents(query: str, *, top: int = 3) -> Dict[str, Any]:
    """Return policy excerpts for helpdesk drafting. Never raises."""
    q = (query or "").strip()
    if not q:
        return {"ok": False, "excerpts": [], "text": _NO_POLICY}

    # 1) Blob PDF RAG (primary fallback when Search is not wired).
    try:
        from tools.rag_tools import search_corporate_policies as blob_rag

        rag = blob_rag(q, top_chunks=min(2, top))
        if rag.get("ok") and (rag.get("text") or "").strip():
            return rag
    except Exception as exc:
        logger.debug("Blob RAG unavailable: %s", exc, exc_info=True)

    # 2) Azure AI Search when credentials exist and return hits.
    azure = _azure_search(q, top)
    if azure:
        return azure

    # 3) Deterministic mock snippets so helpdesk never blocks locally.
    text = _pick_mock(q)
    return {
        "ok": True,
        "mode": "mock",
        "excerpts": [{"title": "Mock policy", "snippet": text}],
        "text": text,
    }
