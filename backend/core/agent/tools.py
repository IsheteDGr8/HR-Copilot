"""Native HR execution tools backed by Azure Cosmos DB and Azure AI Search.

Registered automatically via `@agent_tool` when this module is imported by
`core.agent.loop`.
"""

from __future__ import annotations

import asyncio
import base64
import os
from datetime import datetime, timezone
from email.mime.text import MIMEText
from typing import Any, Dict, List, Optional

from azure.core.credentials import AzureKeyCredential
from azure.search.documents import SearchClient
from googleapiclient.discovery import build

from core.agent.registry import agent_tool
from core.agent.user_context import get_current_user_id
from services.benefits import evaluate_benefits
from services.database import create_employee, get_employee, update_employee_field
from services.db import db_service
from services.storage import get_onboarding_document_links
from services.google_oauth import (
    credentials_from_token_dict,
    credentials_to_token_dict,
    ensure_fresh_credentials,
)

_GMAIL_NOT_CONNECTED = (
    "Gmail is not connected. Please navigate to the Tools tab in the sidebar "
    "to connect your Google account before sending emails."
)

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
async def lookup_employee_record(search_term: str) -> Any:
    """Look up an employee in Cosmos DB by email or name.

    Returns the full employee record (including salary and start date) so you
    can answer HR data questions. Call this immediately when asked for
    employee details — do not invent values.
    """
    term = (search_term or "").strip()
    if not term:
        return _error("search_term is required (email or employee name).")
    try:
        result = await asyncio.to_thread(get_employee, term)
        return result
    except Exception as exc:
        return _error(f"Employee lookup failed: {exc}")


@agent_tool
async def commit_new_hire_to_db(
    first_name: str,
    last_name: str,
    personal_email: str,
    role: str,
    department: str,
    start_date: str,
    dob: str,
    assigned_benefits: Any = None,
) -> Any:
    """Persist a new hire to the Cosmos DB employees container.

    ONLY call after the user explicitly confirms with
    `[PROVISIONING APPROVED]` or `[UPDATE APPROVED]` in the UI.
    """
    first = (first_name or "").strip()
    last = (last_name or "").strip()
    email = (personal_email or "").strip()
    role_val = (role or "").strip()
    dept = (department or "").strip()
    start = (start_date or "").strip()
    birth = (dob or "").strip()

    missing = [
        name
        for name, val in [
            ("first_name", first),
            ("last_name", last),
            ("personal_email", email),
            ("role", role_val),
            ("department", dept),
            ("start_date", start),
            ("dob", birth),
        ]
        if not val
    ]
    if missing:
        return _error(f"Missing required fields: {', '.join(missing)}.")

    employee_data: Dict[str, Any] = {
        "first_name": first,
        "last_name": last,
        "name": f"{first} {last}".strip(),
        "email": email,
        "company": "ClosedAI",
        "role": role_val,
        "department": dept,
        "hireDate": start,
        "dateOfBirth": birth,
        "visaType": None,
        "status": "active",
        "manager": None,
        "engagementScore": None,
        "lastSurveyDate": None,
        "assigned_benefits": assigned_benefits if assigned_benefits is not None else [],
        "source": "hr_copilot_onboarding",
    }

    try:
        created = await asyncio.to_thread(create_employee, employee_data)
        if isinstance(created, dict) and created.get("error"):
            return created
        emp_id = None
        if isinstance(created, dict):
            emp_id = created.get("employeeId") or created.get("id")
        if not emp_id:
            return _error("Employee create returned no id.", result=created)
        return f"Successfully created employee record in Cosmos DB. New Employee ID is {emp_id}."
    except Exception as exc:
        return _error(f"Failed to commit new hire: {exc}")


@agent_tool
async def update_employee_record(email: str, field_name: str, new_value: Any) -> Any:
    """Update a single field on an employee record in Cosmos DB.

    ONLY call after the user explicitly confirms with
    `[PROVISIONING APPROVED]` or `[UPDATE APPROVED]` in the UI.
    """
    email_val = (email or "").strip()
    field = (field_name or "").strip()
    if not email_val:
        return _error("email is required.")
    if not field:
        return _error("field_name is required.")

    try:
        updated = await asyncio.to_thread(
            update_employee_field, email_val, field, new_value
        )
        if isinstance(updated, dict) and updated.get("error"):
            return updated
        return {
            "ok": True,
            "message": f"Successfully updated '{field}' for {email_val}.",
            "employee": updated,
        }
    except Exception as exc:
        return _error(f"Failed to update employee record: {exc}")


@agent_tool
async def prepare_onboarding_packet(
    first_name: str,
    last_name: str,
    personal_email: str,
    role: str,
    department: str,
    start_date: str,
    dob: str,
    salary: int,
) -> Any:
    """REQUIRED for employee onboarding — prepare the HR onboarding packet.

    Collect first_name, last_name, personal_email, role, department, start_date,
    dob (YYYY-MM-DD), and salary first. If any are missing, ask the user.
    Then call this tool ONLY (do not call trigger_onboarding / send_email yet).
    Opens the Side Canvas ONBOARDING_WORKFLOW for HR review before any send.
    The drafted_email field is a Python-generated template — never rewrite it.
    """
    try:
        first = (first_name or "").strip()
        last = (last_name or "").strip()
        email = (personal_email or "").strip()
        role_val = (role or "").strip()
        dept = (department or "").strip()
        start = (start_date or "").strip()
        birth = (dob or "").strip()
        try:
            salary_val = int(salary)
        except (TypeError, ValueError):
            return _error("salary must be an integer (annual USD).")

        missing = [
            name
            for name, val in [
                ("first_name", first),
                ("last_name", last),
                ("personal_email", email),
                ("role", role_val),
                ("department", dept),
                ("start_date", start),
                ("dob", birth),
            ]
            if not val
        ]
        if missing:
            return _error(f"Missing required fields: {', '.join(missing)}.")
        if salary_val < 0:
            return _error("salary must be a non-negative integer.")

        employee_name = f"{first} {last}".strip()
        employee_data = {
            "first_name": first,
            "last_name": last,
            "personal_email": email,
            "role": role_val,
            "department": dept,
            "start_date": start,
            "dob": birth,
            "salary": salary_val,
        }
        assigned_benefits = evaluate_benefits(employee_data)

        # Strict Python template — blob links (or hardcoded fallback). Never empty.
        dynamic_document_list = await asyncio.to_thread(get_onboarding_document_links)
        if not (dynamic_document_list or "").strip():
            dynamic_document_list = (
                "- Form I-9: [https://placeholder.link/i9](https://placeholder.link/i9)\n"
                "- Employee NDA & Compliance: [https://placeholder.link/nda](https://placeholder.link/nda)\n"
                "- Emergency Contact Form: [https://placeholder.link/emergency](https://placeholder.link/emergency)"
            )

        drafted_email = (
            f"Welcome to the team, {first}! We are excited to have you joining as {role_val} "
            f"in the {dept} department starting on {start}.\n"
            f"\n"
            f"To ensure you are fully prepared for your first day, please review and sign the following required documents:\n"
            f"\n"
            f"{dynamic_document_list}\n"
            f"\n"
            f"Keep an eye out for additional emails from the IT department regarding your equipment and account provisioning.\n"
            f"\n"
            f"If you have any questions prior to your start date, feel free to reply directly to this email. Welcome aboard!"
        )

        llm_stop_message = (
            f"Onboarding packet prepared. STOP. Do not generate or rewrite the email. "
            f"The exact drafted email injected into the UI was:\n\n{drafted_email}\n\n"
            f"Tell the user to review the Side Canvas."
        )

        drafted_teams_message = (
            f"IT Provisioning request — new hire\n"
            f"Name: {employee_name}\n"
            f"Role: {role_val}\n"
            f"Department: {dept}\n"
            f"Start date: {start}\n"
            f"Personal email (for initial contact): {email}\n"
            f"Please provision laptop, corp email, SSO groups, and standard "
            f"{dept} access before {start}."
        )

        # Persist a checklist so Confirm & Provision IT can continue the flow.
        record = await db_service.create_onboarding_checklist(
            employee_name=employee_name,
            role=role_val,
            department=dept,
        )
        checklist = []
        if isinstance(record, dict) and "error" not in record:
            owners = {
                "it_provisioning": "IT",
                "laptop_setup": "IT",
                "email_account": "IT",
                "document_signing": "HR",
                "benefits_enrollment": "HR",
            }
            for item in record.get("checklist") or []:
                key = str(item.get("key") or item.get("id") or "")
                checklist.append(
                    {
                        "id": key or str(item.get("id") or ""),
                        "name": item.get("label") or item.get("name") or key,
                        "status": item.get("status") or "Pending",
                        "owner": item.get("owner") or owners.get(key, "HR / IT"),
                        "key": key,
                        "label": item.get("label") or item.get("name") or key,
                    }
                )

        return {
            "ok": True,
            "employee_name": employee_name,
            "first_name": first,
            "last_name": last,
            "personal_email": email,
            "role": role_val,
            "department": dept,
            "start_date": start,
            "dob": birth,
            "salary": salary_val,
            "assigned_benefits": assigned_benefits,
            "drafted_email": drafted_email,
            "onboarding_documents": dynamic_document_list,
            "drafted_teams_message": drafted_teams_message,
            "employee_id": (record or {}).get("employee_id") or (record or {}).get("id"),
            "checklist": checklist,
            "status": "awaiting_approval",
            # Exact text the LLM receives (loop.py uses `message` for this tool).
            "message": llm_stop_message,
        }
    except Exception as exc:
        return _error(f"Failed to prepare onboarding packet: {exc}")


@agent_tool
async def trigger_onboarding(employee_name: str, role: str, department: str) -> dict:
    """Legacy checklist-only onboarding helper.

    Prefer prepare_onboarding_packet when collecting full new-hire details
    (email, DOB, salary, start date). Use this only for a minimal checklist bootstrap.
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

        # Normalize checklist for ONBOARDING_WORKFLOW UI (id/name/status/owner).
        owners = {
            "it_provisioning": "IT",
            "laptop_setup": "IT",
            "email_account": "IT",
            "document_signing": "HR",
            "benefits_enrollment": "HR",
        }
        checklist = []
        for item in record.get("checklist") or []:
            key = str(item.get("key") or item.get("id") or "")
            checklist.append(
                {
                    "id": key or str(item.get("id") or ""),
                    "name": item.get("label") or item.get("name") or key,
                    "status": item.get("status") or "Pending",
                    "owner": item.get("owner") or owners.get(key, "HR / IT"),
                    # Keep legacy keys for older consumers.
                    "key": key,
                    "label": item.get("label") or item.get("name") or key,
                }
            )

        return {
            "ok": True,
            "message": f"Onboarding started for {name}.",
            "employee_id": record.get("employee_id") or record.get("id"),
            "employee_name": record.get("employee_name"),
            "role": record.get("role"),
            "department": record.get("department"),
            "start_date": record.get("start_date") or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "status": record.get("status"),
            "checklist": checklist,
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


@agent_tool
async def draft_email(to_email: str, subject: str, body: str) -> Any:
    """REQUIRED for email — draft an email in the Side Canvas for human review.

    Call this IMMEDIATELY when the user asks to send, email, or notify someone.
    NEVER call send_email first. The UI will collect approval; only after the
    user replies with [APPROVED TO SEND] may send_email be used.
    """
    recipient = (to_email or "").strip()
    subj = (subject or "").strip()
    content = body if body is not None else ""
    if not recipient:
        return _error("to_email is required.")
    if not subj:
        return _error("subject is required.")

    return {
        "ok": True,
        "to_email": recipient,
        "subject": subj,
        "body": content,
        "status": "awaiting_approval",
        "message": (
            "Draft created. Do not send the email yet. "
            "Await user approval in the UI."
        ),
    }


def _send_gmail_sync(creds, to: str, subject: str, body: str) -> dict:
    """Blocking Gmail send used via asyncio.to_thread."""
    service = build("gmail", "v1", credentials=creds, cache_discovery=False)
    message = MIMEText(body or "")
    message["to"] = to
    message["subject"] = subject
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
    sent = (
        service.users()
        .messages()
        .send(userId="me", body={"raw": raw})
        .execute()
    )
    return {"id": sent.get("id"), "threadId": sent.get("threadId")}


@agent_tool
async def send_email(to: str, subject: str, body: str) -> Any:
    """Send email via Gmail ONLY after explicit UI approval.

    NEVER call this when the user first asks to send an email — use draft_email
    instead. Call send_email only when the latest user message contains
    '[APPROVED TO SEND]' with the exact To / Subject / Body to dispatch.
    Requires Gmail connected under Tools → Google / Gmail.
    """
    try:
        recipient = (to or "").strip()
        subj = (subject or "").strip()
        content = body if body is not None else ""
        if not recipient:
            return _error("Recipient (to) is required.")
        if not subj:
            return _error("Subject is required.")

        user_id = get_current_user_id()
        integration = await db_service.get_user_tokens(user_id, "gmail")
        tokens = (integration or {}).get("tokens") if integration else None
        if not tokens:
            return _GMAIL_NOT_CONNECTED

        creds = credentials_from_token_dict(tokens)
        creds = await asyncio.to_thread(ensure_fresh_credentials, creds)

        # Persist refreshed access token when applicable.
        if creds.token and creds.token != tokens.get("token"):
            await db_service.upsert_user_tokens(
                user_id, credentials_to_token_dict(creds)
            )

        result = await asyncio.to_thread(_send_gmail_sync, creds, recipient, subj, content)
        return {
            "ok": True,
            "message": f"Email sent successfully to {recipient} with subject '{subj}'.",
            "to": recipient,
            "subject": subj,
            "gmail_message_id": result.get("id"),
        }
    except Exception as exc:
        return {
            "error": f"Failed to send email via Gmail: {exc}",
            "hint": _GMAIL_NOT_CONNECTED,
        }
