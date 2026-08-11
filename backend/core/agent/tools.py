"""Native HR execution tools backed by Azure Cosmos DB and Azure AI Search.

Registered automatically via `@agent_tool` when this module is imported by
`core.agent.loop`.
"""

from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone
from typing import Any, List, Optional

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


def _normalize_skills(skills: Any) -> List[str]:
    if skills is None:
        return []
    if isinstance(skills, str):
        # Allow comma-separated skills from the LLM.
        parts = [p.strip() for p in skills.split(",")]
        return [p for p in parts if p]
    if isinstance(skills, list):
        return [str(s).strip() for s in skills if str(s).strip()]
    return []


@agent_tool
async def screen_candidates(job_role: str, required_skills: list[str]) -> Any:
    """REQUIRED TOOL — Call this tool immediately when asked to screen candidates,
    rank applicants, shortlist resumes, or find who fits a role.

    Do NOT ask the user for candidate names, resumes, LinkedIn links, or uploads.
    The tool fetches all candidate data automatically from the database and ranks
    them. Infer job_role and required_skills from the user's request; if skills are
    implied (e.g. "Python engineer"), pass a simple string array like
    ["python", "sql"]. job_role is a plain string (e.g. "Software Engineer").
    """
    try:
        role = (job_role or "").strip()
        skills = _normalize_skills(required_skills)
        if not role:
            return "Error: Unable to screen candidates. job_role is required."
        if not skills:
            return "Error: Unable to screen candidates. required_skills must be a non-empty list."

        candidates = await db_service.list_candidates_by_role(role)
        if not candidates:
            return (
                f"Error: Unable to screen candidates. No candidates found for role '{role}'. "
                "Please check database connection or seed the candidates container."
            )

        required_norm = [s.lower() for s in skills]
        ranked = []
        for cand in candidates:
            cand_skills = [str(s).lower() for s in (cand.get("skills") or [])]
            matched = [s for s in required_norm if s in cand_skills]
            ranked.append(
                {
                    "id": cand.get("id"),
                    "name": cand.get("name") or "Unknown",
                    "job_role": cand.get("job_role") or role,
                    "skills": cand.get("skills") or [],
                    "years_experience": cand.get("years_experience"),
                    "summary": cand.get("summary") or "",
                    "matched_skills": matched,
                    "match_count": len(matched),
                    "match_score": round(len(matched) / max(len(required_norm), 1), 2),
                }
            )

        ranked.sort(key=lambda c: (c["match_count"], c.get("years_experience") or 0), reverse=True)
        top = ranked[:3]
        if not top or top[0]["match_count"] == 0:
            return (
                f"No relevant candidates matched the required skills for '{role}'. "
                f"Required: {', '.join(skills)}."
            )

        lines = [f"Top candidates for {role} (skills: {', '.join(skills)}):"]
        for i, c in enumerate(top, start=1):
            matched = ", ".join(c["matched_skills"]) or "none"
            lines.append(
                f"{i}. {c['name']} — {c['match_count']}/{len(skills)} skills "
                f"({matched}); {c.get('years_experience') or '?'} yrs — {c.get('summary') or 'No summary'}"
            )
        summary = "\n".join(lines)

        return {
            "ok": True,
            "summary": summary,
            "job_role": role,
            "required_skills": skills,
            "recommendations": top,
        }
    except Exception:
        return "Error: Unable to screen candidates. Please check database connection."


@agent_tool
async def assign_training_module(employee_id: str, module_name: str, due_date: str) -> Any:
    """REQUIRED TOOL — Call this tool immediately when a user asks to assign
    compliance, training, or learning modules to an employee.

    Do not ask for additional context, course catalogs, LMS links, or confirmation
    before calling. The tool creates the tracking record natively. Pass:
    employee_id (plain string id or name token the user gave), module_name (plain
    string), and due_date as a simple YYYY-MM-DD string (e.g. "2026-09-15"). If the
    user says "in two weeks" without a date, pick a reasonable YYYY-MM-DD and call.
    """
    try:
        emp = (employee_id or "").strip()
        module = (module_name or "").strip()
        due = (due_date or "").strip()
        if not emp:
            return "Error: Unable to assign training. employee_id is required."
        if not module:
            return "Error: Unable to assign training. module_name is required."
        if not due:
            return "Error: Unable to assign training. due_date is required (YYYY-MM-DD)."

        saved = await db_service.upsert_training_log(
            {
                "employee_id": emp,
                "module_name": module,
                "due_date": due,
                "status": "Pending",
            }
        )
        if "error" in saved:
            return (
                "Error: Unable to assign training. Please check database connection. "
                f"Details: {saved.get('error')}"
            )

        return {
            "ok": True,
            "summary": (
                f"Assigned '{module}' to employee {emp} (due {due}). Status: Pending."
            ),
            "training_id": saved.get("id"),
            "employee_id": emp,
            "module_name": module,
            "due_date": due,
            "status": saved.get("status", "Pending"),
            "created_at": saved.get("created_at"),
        }
    except Exception:
        return "Error: Unable to assign training. Please check database connection."


@agent_tool
async def generate_schedule(department: str, week_start_date: str) -> Any:
    """REQUIRED TOOL — Call this tool immediately to generate a shift schedule when
    the user asks for staffing, weekly shifts, or a department roster schedule.

    Do NOT ask the user for staffing rosters, headcount constraints, shift rules,
    or timezones. The database handles all rules natively. Pass department as a
    plain string (e.g. "Engineering") and week_start_date as a simple YYYY-MM-DD
    string (e.g. "2026-09-01"). If the user says "next week" without a date, pick
    the coming Monday as YYYY-MM-DD and call the tool.
    """
    try:
        dept = (department or "").strip()
        week_start = (week_start_date or "").strip()
        if not dept:
            return "Error: Unable to generate schedule. department is required."
        if not week_start:
            return "Error: Unable to generate schedule. week_start_date is required (YYYY-MM-DD)."

        # Simple deterministic weekly template (Mon–Fri day/evening coverage).
        days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
        roles = [
            ("Morning", "08:00–16:00"),
            ("Evening", "16:00–00:00"),
        ]
        shifts = []
        for day_index, day in enumerate(days):
            for shift_name, hours in roles:
                shifts.append(
                    {
                        "day": day,
                        "day_offset": day_index,
                        "shift": shift_name,
                        "hours": hours,
                        "headcount": 2 if shift_name == "Morning" else 1,
                        "notes": f"{dept} coverage",
                    }
                )

        schedule_body = {
            "department": dept,
            "week_start_date": week_start,
            "timezone": "America/Los_Angeles",
            "shifts": shifts,
            "status": "draft",
        }
        saved = await db_service.upsert_schedule(schedule_body)
        if "error" in saved:
            return (
                "Error: Unable to generate schedule. Please check database connection. "
                f"Details: {saved.get('error')}"
            )

        total_slots = sum(int(s.get("headcount") or 0) for s in shifts)
        summary = (
            f"Draft schedule for {dept} starting {week_start}: "
            f"{len(shifts)} shifts, {total_slots} total staff slots "
            f"(Mon–Fri morning + evening coverage)."
        )
        return {
            "ok": True,
            "summary": summary,
            "schedule_id": saved.get("id"),
            "department": dept,
            "week_start_date": week_start,
            "status": saved.get("status", "draft"),
            "shifts": shifts,
            "total_staff_slots": total_slots,
        }
    except Exception:
        return "Error: Unable to generate schedule. Please check database connection."
