"""Direct Azure Cosmos DB tools (internal data plane — not MCP)."""

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from azure.cosmos import CosmosClient, PartitionKey
from azure.cosmos.exceptions import CosmosHttpResponseError, CosmosResourceNotFoundError

from core.config import get_settings

logger = logging.getLogger(__name__)

_client: Optional[CosmosClient] = None
_EMP_ID_RE = re.compile(r"^emp-(\d+)$", re.IGNORECASE)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_client() -> CosmosClient:
    global _client
    if _client is not None:
        return _client
    settings = get_settings()
    endpoint, key = settings.cosmos_credentials()
    if not endpoint or not key:
        raise ValueError("Cosmos credentials missing (COSMOS_ENDPOINT/KEY or CONNECTION_STRING).")
    _client = CosmosClient(endpoint, credential=key)
    return _client


def get_container(name: str):
    settings = get_settings()
    db = get_client().get_database_client(settings.cosmos_database)
    return db.get_container_client(name)


def ensure_container(name: str, partition_path: str = "/id"):
    settings = get_settings()
    database = get_client().create_database_if_not_exists(id=settings.cosmos_database)
    try:
        return database.create_container_if_not_exists(
            id=name,
            partition_key=PartitionKey(path=partition_path),
        )
    except CosmosHttpResponseError:
        return database.get_container_client(name)


def lookup_employee(search_term: str) -> dict:
    term = (search_term or "").strip()
    if not term:
        return {"error": "search_term is required."}
    settings = get_settings()
    container = get_container(settings.cosmos_employees)
    term_l = term.lower()
    query = """
    SELECT * FROM c
    WHERE LOWER(c.email) = @term
       OR LOWER(c.personal_email) = @term
       OR LOWER(c.id) = @term
       OR LOWER(c.employeeId) = @term
       OR CONTAINS(LOWER(c.name), @term)
       OR CONTAINS(LOWER(c.employee_name), @term)
    """
    hits = list(
        container.query_items(
            query=query,
            parameters=[{"name": "@term", "value": term_l}],
            enable_cross_partition_query=True,
        )
    )
    if not hits:
        return {"error": f"No employee found matching '{term}'."}
    return dict(hits[0])


def _next_emp_id(container) -> str:
    ids: List[str] = []
    for item in container.query_items(
        query="SELECT c.id, c.employeeId FROM c",
        enable_cross_partition_query=True,
    ):
        ids.append(str(item.get("id") or ""))
        ids.append(str(item.get("employeeId") or ""))
    max_n = 0
    for raw in ids:
        m = _EMP_ID_RE.match(raw.strip())
        if m:
            max_n = max(max_n, int(m.group(1)))
    return f"emp-{max_n + 1:04d}"


def commit_new_hire(employee_data: dict) -> dict:
    settings = get_settings()
    container = get_container(settings.cosmos_employees)
    emp_id = _next_emp_id(container)
    first = str(employee_data.get("first_name") or "").strip()
    last = str(employee_data.get("last_name") or "").strip()
    name = str(employee_data.get("name") or f"{first} {last}").strip()
    email = str(employee_data.get("email") or employee_data.get("personal_email") or "").strip()
    department = str(employee_data.get("department") or "").strip()
    body = {
        "id": emp_id,
        "employeeId": emp_id,
        "name": name,
        "email": email,
        "company": employee_data.get("company") or "ClosedAI",
        "role": employee_data.get("role"),
        "department": department,
        "hireDate": employee_data.get("hireDate") or employee_data.get("start_date"),
        "dateOfBirth": employee_data.get("dateOfBirth") or employee_data.get("dob"),
        "visaType": employee_data.get("visaType"),
        "status": employee_data.get("status") or "active",
        "manager": employee_data.get("manager"),
        "annualSalary": employee_data.get("salary") or employee_data.get("annualSalary"),
        "employmentType": employee_data.get("employment_type") or employee_data.get("employmentType") or "W-2",
        "source": "hr_copilot_onboarding",
        "created_at": _utc_now(),
    }
    saved = container.upsert_item(body=body)
    return dict(saved)


def update_employee_field(email: str, field: str, new_value: Any) -> dict:
    record = lookup_employee(email)
    if record.get("error"):
        return record
    if field in ("id", "_rid", "_self", "_etag", "_ts"):
        return {"error": f"Field '{field}' cannot be updated."}
    record[field] = new_value
    record["updated_at"] = _utc_now()
    settings = get_settings()
    container = get_container(settings.cosmos_employees)
    saved = container.replace_item(item=record["id"], body=record)
    return dict(saved)


# Map common role / JD labels onto compensation_bands.jobFamily values.
_JOB_FAMILY_ALIASES = {
    "engineering": "engineering",
    "software engineering": "engineering",
    "software engineer": "engineering",
    "software development": "engineering",
    "software development engineer": "engineering",
    "sde": "engineering",
    "sde1": "engineering",
    "sde 1": "engineering",
    "swe": "engineering",
    "swe1": "engineering",
    "people": "people",
    "hr": "people",
    "human resources": "people",
    "finance": "finance",
    "sales": "sales",
}


def _normalize_job_family(job_family: str) -> str:
    raw = (job_family or "").strip()
    if not raw:
        return ""
    aliased = _JOB_FAMILY_ALIASES.get(raw.lower())
    if aliased:
        # Prefer canonical Cosmos casing used by seed_data.
        return {
            "engineering": "Engineering",
            "people": "People",
            "finance": "Finance",
            "sales": "Sales",
        }.get(aliased, raw)
    return raw


def get_compensation_band(job_family: str, level: str | None = None) -> dict:
    settings = get_settings()
    family = _normalize_job_family(job_family)
    if not family:
        return {"error": "job_family is required."}
    try:
        container = get_container(settings.cosmos_bands)
        query = "SELECT * FROM c WHERE LOWER(c.jobFamily) = @fam OR LOWER(c.job_family) = @fam"
        params: List[Dict[str, Any]] = [{"name": "@fam", "value": family.lower()}]
        if level:
            query += " AND (LOWER(c.level) = @lvl OR LOWER(c.jobLevel) = @lvl)"
            params.append({"name": "@lvl", "value": level.strip().lower()})
        hits = list(
            container.query_items(query=query, parameters=params, enable_cross_partition_query=True)
        )
    except CosmosResourceNotFoundError:
        return {
            "error": (
                f"compensation_bands container is missing in Cosmos DB "
                f"({settings.cosmos_database}/{settings.cosmos_bands}). "
                "Run: python -m scripts.seed_data --bands-only"
            )
        }
    except Exception as exc:
        return {"error": f"compensation_bands lookup failed: {exc}"}
    if not hits:
        # Soft fallback: try family-only when a specific level missed.
        if level:
            return get_compensation_band(family, None)
        return {"error": f"No compensation band for jobFamily={family!r} level={level!r}."}
    return dict(hits[0])


def upsert_integration_tokens(user_id: str, service: str, tokens: dict) -> dict:
    settings = get_settings()
    container = ensure_container(settings.cosmos_integrations, partition_path="/id")
    doc_id = f"{user_id}:{service}"
    body = {
        "id": doc_id,
        "user_id": user_id,
        "service": service,
        "connected": True,
        "tokens": tokens,
        "updated_at": _utc_now(),
    }
    return dict(container.upsert_item(body=body))


def get_integration_tokens(user_id: str, service: str) -> Optional[dict]:
    settings = get_settings()
    try:
        container = get_container(settings.cosmos_integrations)
        doc_id = f"{user_id}:{service}"
        return dict(container.read_item(item=doc_id, partition_key=doc_id))
    except CosmosResourceNotFoundError:
        return None
    except Exception:
        logger.debug("get_integration_tokens failed", exc_info=True)
        return None


def init_onboarding_checklist(
    employee_id: str,
    *,
    employee_name: str = "",
    role: str = "",
    department: str = "",
    nda_required: bool = True,
) -> dict:
    """Create/replace tracking doc partitioned by /employeeId (5-step onboarding flags)."""
    settings = get_settings()
    emp_id = (employee_id or "").strip()
    if not emp_id:
        raise ValueError("employeeId is required for onboarding_checklists.")
    container = ensure_container(settings.cosmos_checklists, partition_path="/employeeId")
    nda_req = bool(nda_required)
    body = {
        "id": emp_id,
        "employeeId": emp_id,
        "employee_name": employee_name,
        "role": role,
        "department": department,
        "status": "in_progress",
        "background_check": False,
        "profile_setup": False,
        "email_setup": False,
        "i9_signed": False,
        "nda_required": nda_req,
        "nda_signed": False if nda_req else None,
        "emergency_contact": False,
        "training_checklist": False,
        "created_at": _utc_now(),
        "updated_at": _utc_now(),
    }
    return dict(container.upsert_item(body=body))


def get_onboarding_checklist(employee_id: str) -> Optional[dict]:
    settings = get_settings()
    emp_id = (employee_id or "").strip()
    if not emp_id:
        return None
    try:
        container = get_container(settings.cosmos_checklists)
    except Exception:
        logger.debug("onboarding_checklists container missing", exc_info=True)
        return None
    for pk in (emp_id,):
        try:
            return dict(container.read_item(item=emp_id, partition_key=pk))
        except CosmosResourceNotFoundError:
            continue
        except CosmosHttpResponseError:
            continue
    hits = list(
        container.query_items(
            query="SELECT * FROM c WHERE c.employeeId = @id OR c.id = @id",
            parameters=[{"name": "@id", "value": emp_id}],
            enable_cross_partition_query=True,
        )
    )
    return dict(hits[0]) if hits else None


CHECKLIST_BOOL_FLAGS = (
    "background_check",
    "profile_setup",
    "email_setup",
    "i9_signed",
    "nda_signed",
    "emergency_contact",
    "training_checklist",
)

# Fields the caller must never overwrite via a PATCH.
_CHECKLIST_PROTECTED = {"id", "employeeId", "_rid", "_self", "_etag", "_attachments", "_ts", "created_at"}


def _recompute_checklist_status(doc: dict) -> str:
    """Complete only when every required flag is true (NDA skipped if not required)."""
    required = ["background_check", "profile_setup", "email_setup", "i9_signed",
                "emergency_contact", "training_checklist"]
    if doc.get("nda_required"):
        required.append("nda_signed")
    return "complete" if all(bool(doc.get(flag)) for flag in required) else "in_progress"


def update_onboarding_checklist(employee_id: str, updates: dict) -> Optional[dict]:
    """Patch whitelisted boolean flags on the tracking doc, recompute status.

    Partitioned by /employeeId. Returns the saved doc, or None if not found.
    """
    emp_id = (employee_id or "").strip()
    if not emp_id:
        return None
    doc = get_onboarding_checklist(emp_id)
    if not doc:
        return None
    for key, value in (updates or {}).items():
        if key in _CHECKLIST_PROTECTED:
            continue
        if key in CHECKLIST_BOOL_FLAGS:
            doc[key] = bool(value)
    doc["status"] = _recompute_checklist_status(doc)
    doc["updated_at"] = _utc_now()
    settings = get_settings()
    container = get_container(settings.cosmos_checklists)
    return dict(container.replace_item(item=doc["id"], body=doc))


def set_checklist_it_ticket(
    employee_id: str,
    *,
    ticket_id: str,
    status: str = "submitted",
) -> Optional[dict]:
    """Record the IT ticket id/status on the checklist doc (non-boolean fields)."""
    emp_id = (employee_id or "").strip()
    if not emp_id:
        return None
    doc = get_onboarding_checklist(emp_id)
    if not doc:
        return None
    doc["it_ticket_id"] = ticket_id
    doc["it_ticket_status"] = status
    doc["updated_at"] = _utc_now()
    settings = get_settings()
    container = get_container(settings.cosmos_checklists)
    return dict(container.replace_item(item=doc["id"], body=doc))


def save_onboarding_checklist(employee_name: str, role: str, department: str) -> dict:
    """Legacy helper — prefer init_onboarding_checklist after a hire is committed."""
    return init_onboarding_checklist(
        str(uuid.uuid4()),
        employee_name=employee_name,
        role=role,
        department=department,
    )


# ---------------------------------------------------------------------------
# Applicants (ATS) — partitioned by /requisitionId
# ---------------------------------------------------------------------------

APPLICANT_STATUSES = ("Applied", "Shortlisted", "Interviewing", "Rejected")
_APPLICANT_PROTECTED = {
    "id",
    "requisitionId",
    "_rid",
    "_self",
    "_etag",
    "_attachments",
    "_ts",
    "created_at",
}


def upsert_applicant(
    *,
    requisition_id: str,
    name: str,
    resume_blob_url: str = "",
    ai_summary: str = "",
    skills: Optional[List[str]] = None,
    gaps: Optional[List[str]] = None,
    match_score: int = 0,
    status: str = "Applied",
    applicant_id: str | None = None,
    job_role: str = "",
) -> dict:
    """Create/replace an applicant profile under a requisition."""
    req = (requisition_id or "").strip() or "unassigned"
    settings = get_settings()
    container = ensure_container(settings.cosmos_applicants, partition_path="/requisitionId")
    doc_id = (applicant_id or "").strip() or f"app-{uuid.uuid4().hex[:12]}"
    st = status if status in APPLICANT_STATUSES else "Applied"
    score = max(0, min(100, int(match_score or 0)))
    body = {
        "id": doc_id,
        "requisitionId": req,
        "name": (name or "Candidate").strip(),
        "resume_blob_url": resume_blob_url or "",
        "ai_summary": ai_summary or "",
        "skills": list(skills or []),
        "gaps": list(gaps or []),
        "match_score": score,
        "status": st,
        "job_role": job_role or "",
        "created_at": _utc_now(),
        "updated_at": _utc_now(),
    }
    return dict(container.upsert_item(body=body))


def list_applicants(requisition_id: str) -> List[dict]:
    req = (requisition_id or "").strip()
    if not req:
        return []
    settings = get_settings()
    try:
        container = get_container(settings.cosmos_applicants)
    except Exception:
        return []
    try:
        hits = list(
            container.query_items(
                query="SELECT * FROM c WHERE c.requisitionId = @req",
                parameters=[{"name": "@req", "value": req}],
                partition_key=req,
            )
        )
    except Exception:
        try:
            hits = list(
                container.query_items(
                    query="SELECT * FROM c WHERE c.requisitionId = @req",
                    parameters=[{"name": "@req", "value": req}],
                    enable_cross_partition_query=True,
                )
            )
        except CosmosResourceNotFoundError:
            return []
        except Exception:
            logger.debug("list_applicants failed", exc_info=True)
            return []
    out = [dict(h) for h in hits]
    out.sort(key=lambda d: (-int(d.get("match_score") or 0), str(d.get("name") or "")))
    return out


def get_applicant(applicant_id: str, requisition_id: str | None = None) -> Optional[dict]:
    aid = (applicant_id or "").strip()
    if not aid:
        return None
    settings = get_settings()
    try:
        container = get_container(settings.cosmos_applicants)
    except Exception:
        return None
    if requisition_id:
        try:
            return dict(container.read_item(item=aid, partition_key=requisition_id.strip()))
        except CosmosResourceNotFoundError:
            pass
        except Exception:
            logger.debug("get_applicant by pk failed", exc_info=True)
    try:
        hits = list(
            container.query_items(
                query="SELECT * FROM c WHERE c.id = @id",
                parameters=[{"name": "@id", "value": aid}],
                enable_cross_partition_query=True,
            )
        )
        return dict(hits[0]) if hits else None
    except Exception:
        logger.debug("get_applicant query failed", exc_info=True)
        return None


def update_applicant(
    applicant_id: str,
    updates: dict,
    *,
    requisition_id: str | None = None,
) -> Optional[dict]:
    """Patch applicant fields (status, interview metadata). Partitioned by /requisitionId."""
    doc = get_applicant(applicant_id, requisition_id)
    if not doc:
        return None
    for key, value in (updates or {}).items():
        if key in _APPLICANT_PROTECTED:
            continue
        if key == "status":
            if value in APPLICANT_STATUSES:
                doc["status"] = value
            continue
        if key == "match_score":
            doc["match_score"] = max(0, min(100, int(value or 0)))
            continue
        if key in ("skills", "gaps") and isinstance(value, list):
            doc[key] = value
            continue
        if key in (
            "name",
            "ai_summary",
            "resume_blob_url",
            "job_role",
            "interview_slot",
            "meeting_link",
            "notes",
        ):
            doc[key] = value
    doc["updated_at"] = _utc_now()
    settings = get_settings()
    container = ensure_container(settings.cosmos_applicants, partition_path="/requisitionId")
    return dict(container.replace_item(item=doc["id"], body=doc))


# ---------------------------------------------------------------------------
# HR helpdesk tickets — partitioned by /employeeId
# ---------------------------------------------------------------------------

TICKET_STATUSES = ("Open", "Pending", "Resolved")
TICKET_PRIORITIES = ("Low", "Medium", "High", "Urgent")
_TICKET_PROTECTED = {
    "id",
    "employeeId",
    "_rid",
    "_self",
    "_etag",
    "_attachments",
    "_ts",
    "created_at",
}


def create_hr_ticket(
    *,
    employee_id: str,
    category: str,
    priority: str,
    question: str,
    suggested_response: str = "",
    policy_reference: str = "",
    employee_name: str = "",
    employee_email: str = "",
    status: str = "Open",
) -> dict:
    emp = (employee_id or "").strip() or "unknown"
    settings = get_settings()
    container = ensure_container(settings.cosmos_tickets, partition_path="/employeeId")
    ticket_id = f"tkt-{uuid.uuid4().hex[:12]}"
    pri = priority if priority in TICKET_PRIORITIES else "Medium"
    st = status if status in TICKET_STATUSES else "Open"
    body = {
        "id": ticket_id,
        "employeeId": emp,
        "employee_name": employee_name or "",
        "employee_email": employee_email or "",
        "category": (category or "General").strip(),
        "priority": pri,
        "question": question or "",
        "suggested_response": suggested_response or "",
        "policy_reference": policy_reference or "",
        "status": st,
        "created_at": _utc_now(),
        "updated_at": _utc_now(),
    }
    return dict(container.upsert_item(body=body))


def get_hr_ticket(ticket_id: str, employee_id: str | None = None) -> Optional[dict]:
    tid = (ticket_id or "").strip()
    if not tid:
        return None
    settings = get_settings()
    try:
        container = get_container(settings.cosmos_tickets)
    except Exception:
        return None
    if employee_id:
        try:
            return dict(container.read_item(item=tid, partition_key=employee_id.strip()))
        except CosmosResourceNotFoundError:
            pass
        except Exception:
            pass
    try:
        hits = list(
            container.query_items(
                query="SELECT * FROM c WHERE c.id = @id",
                parameters=[{"name": "@id", "value": tid}],
                enable_cross_partition_query=True,
            )
        )
        return dict(hits[0]) if hits else None
    except Exception:
        return None


def update_hr_ticket(
    ticket_id: str,
    updates: dict,
    *,
    employee_id: str | None = None,
) -> Optional[dict]:
    doc = get_hr_ticket(ticket_id, employee_id)
    if not doc:
        return None
    for key, value in (updates or {}).items():
        if key in _TICKET_PROTECTED:
            continue
        if key == "status" and value in TICKET_STATUSES:
            doc["status"] = value
            continue
        if key == "priority" and value in TICKET_PRIORITIES:
            doc["priority"] = value
            continue
        if key in ("category", "question", "suggested_response", "policy_reference", "notes"):
            doc[key] = value
    doc["updated_at"] = _utc_now()
    settings = get_settings()
    container = ensure_container(settings.cosmos_tickets, partition_path="/employeeId")
    return dict(container.replace_item(item=doc["id"], body=doc))


def _count_query(container_name: str, query: str, parameters: list | None = None) -> int:
    """Run a SELECT VALUE COUNT(1) query; return 0 on container/query failure."""
    try:
        container = get_container(container_name)
        hits = list(
            container.query_items(
                query=query,
                parameters=parameters or [],
                enable_cross_partition_query=True,
            )
        )
        if not hits:
            return 0
        return int(hits[0] or 0)
    except Exception:
        logger.debug("dashboard count failed on %s", container_name, exc_info=True)
        return 0


def get_dashboard_summary() -> dict:
    """Three lightweight Cosmos counts for the Global HR Dashboard."""
    settings = get_settings()

    # Incomplete onboarding: profile_setup or IT flag still false.
    # Prefer it_provisioning_complete when present; fall back to email_setup.
    incomplete_onboarding = _count_query(
        settings.cosmos_checklists,
        """
        SELECT VALUE COUNT(1) FROM c
        WHERE c.profile_setup = false
           OR c.it_provisioning_complete = false
           OR (NOT IS_DEFINED(c.it_provisioning_complete) AND c.email_setup = false)
        """,
    )

    open_tickets = _count_query(
        settings.cosmos_tickets,
        """
        SELECT VALUE COUNT(1) FROM c
        WHERE c.status = 'Open' OR c.status = 'Pending'
        """,
    )

    active_applicants = _count_query(
        settings.cosmos_applicants,
        """
        SELECT VALUE COUNT(1) FROM c
        WHERE c.status = 'Shortlisted' OR c.status = 'Interviewing'
        """,
    )

    return {
        "incomplete_onboarding": incomplete_onboarding,
        "open_tickets": open_tickets,
        "active_applicants": active_applicants,
        "generated_at": _utc_now(),
    }
