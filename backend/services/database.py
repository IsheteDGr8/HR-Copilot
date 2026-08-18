"""Employee records in Azure Cosmos DB (read / write helpers for agent tools)."""

from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from azure.cosmos import CosmosClient, PartitionKey
from azure.cosmos.exceptions import CosmosHttpResponseError, CosmosResourceNotFoundError

logger = logging.getLogger(__name__)

_client: Optional[CosmosClient] = None
_container = None
_documents_container = None
_mock_employees: Dict[str, Dict[str, Any]] = {}
_EMP_ID_RE = re.compile(r"^emp-(\d+)$", re.IGNORECASE)
_DEFAULT_COMPANY = "ClosedAI"

COSMOS_DOCUMENTS_CONTAINER = os.getenv("COSMOS_DOCUMENTS_CONTAINER", "documents")

_ONBOARDING_TYPE_HINTS = (
    "i9",
    "i-9",
    "i9_form",
    "nda",
    "compliance",
    "emergency",
    "w4",
    "w-4",
    "handbook",
    "onboard",
    "direct_deposit",
    "tax",
)

_FALLBACK_ONBOARDING_DOCS = [
    "- Form I-9: https://placeholder.link/i9",
    "- NDA: https://placeholder.link/nda",
    "- Emergency Contact Form: https://forms.company.internal/emergency-contact",
]

_TYPE_TITLES = {
    "i9_form": "Form I-9",
    "i9": "Form I-9",
    "i-9": "Form I-9",
    "nda": "Employee NDA & Compliance",
    "nda_compliance": "Employee NDA & Compliance",
    "emergency_contact": "Emergency Contact Form",
    "offer_letter": "Offer Letter",
    "w4": "Form W-4",
    "handbook": "Employee Handbook Acknowledgment",
}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_connection_string(raw: str) -> tuple[str, str]:
    """Extract AccountEndpoint / AccountKey from a Cosmos connection string."""
    endpoint = ""
    key = ""
    text = (raw or "").strip().strip('"')
    # Tolerate missing AccountEndpoint= prefix: "https://.../;AccountKey=..."
    if text.lower().startswith("http") and "accountendpoint=" not in text.lower():
        text = f"AccountEndpoint={text}"
        if not text.endswith(";"):
            text += ";"
    for part in text.split(";"):
        part = part.strip()
        if not part or "=" not in part:
            continue
        name, value = part.split("=", 1)
        name_l = name.strip().lower()
        if name_l == "accountendpoint":
            endpoint = value.strip()
        elif name_l == "accountkey":
            key = value.strip()
    return endpoint, key


def _credentials() -> tuple[str, str]:
    endpoint = (os.getenv("COSMOS_ENDPOINT") or "").strip().strip('"')
    key = (os.getenv("COSMOS_KEY") or "").strip().strip('"')
    if endpoint and key:
        return endpoint, key

    conn = (os.getenv("COSMOS_CONNECTION_STRING") or "").strip().strip('"')
    if conn:
        return _parse_connection_string(conn)
    return "", ""


def _use_mock() -> bool:
    flag = (os.getenv("USE_MOCK_AZURE") or "false").strip().strip('"').lower()
    if flag in ("true", "1", "yes"):
        return True
    endpoint, key = _credentials()
    return not (endpoint and key)


def _database_name() -> str:
    # closedai-db is the seeded ClosedAI account; hr_database was an empty default.
    return (os.getenv("COSMOS_DATABASE_NAME") or "closedai-db").strip().strip('"')


def _container_name() -> str:
    return (os.getenv("COSMOS_CONTAINER_NAME") or "employees").strip().strip('"')


def _get_container():
    """Lazy sync Cosmos container client for employee documents."""
    global _client, _container
    if _container is not None:
        return _container

    endpoint, key = _credentials()
    if not endpoint or not key:
        raise ValueError(
            "Cosmos credentials missing. Set COSMOS_ENDPOINT + COSMOS_KEY "
            "or COSMOS_CONNECTION_STRING."
        )

    _client = CosmosClient(endpoint, credential=key)
    # Prefer existing DB/container; only create if missing (local bootstrap).
    database = _client.create_database_if_not_exists(id=_database_name())
    try:
        _container = database.create_container_if_not_exists(
            id=_container_name(),
            partition_key=PartitionKey(path="/id"),
        )
    except CosmosHttpResponseError:
        _container = database.get_container_client(_container_name())
    return _container


def _documents_container_name() -> str:
    return (
        os.getenv("COSMOS_DOCUMENTS_CONTAINER") or COSMOS_DOCUMENTS_CONTAINER or "documents"
    ).strip().strip('"')


def _get_documents_container():
    """Lazy sync Cosmos client for the documents / templates container."""
    global _client, _documents_container
    if _documents_container is not None:
        return _documents_container

    endpoint, key = _credentials()
    if not endpoint or not key:
        raise ValueError(
            "Cosmos credentials missing. Set COSMOS_ENDPOINT + COSMOS_KEY "
            "or COSMOS_CONNECTION_STRING."
        )

    if _client is None:
        _client = CosmosClient(endpoint, credential=key)
    database = _client.get_database_client(_database_name())
    try:
        _documents_container = database.get_container_client(_documents_container_name())
    except Exception:
        _documents_container = database.get_container_client("documents")
    return _documents_container


def reset_client() -> None:
    """Clear cached client (e.g. after env changes / tests)."""
    global _client, _container, _documents_container
    _client = None
    _container = None
    _documents_container = None


def _blob_account_name() -> str:
    conn = (os.getenv("AZURE_BLOB_CONNECTION_STRING") or "").strip().strip('"')
    for part in conn.split(";"):
        if part.lower().startswith("accountname="):
            return part.split("=", 1)[1].strip()
    return (os.getenv("AZURE_BLOB_ACCOUNT_NAME") or "").strip()


def _resolve_document_url(item: Dict[str, Any]) -> str:
    raw = str(
        item.get("url")
        or item.get("blobUrl")
        or item.get("blob_url")
        or item.get("href")
        or ""
    ).strip()
    if not raw:
        return ""
    if raw.startswith("http://") or raw.startswith("https://"):
        return raw
    if raw.startswith("blob://"):
        rest = raw[len("blob://") :].lstrip("/")
        account = _blob_account_name()
        if account and rest:
            return f"https://{account}.blob.core.windows.net/{rest}"
    return raw


def _document_title(item: Dict[str, Any]) -> str:
    title = str(item.get("title") or item.get("name") or item.get("label") or "").strip()
    if title:
        return title
    dtype = str(item.get("type") or item.get("documentType") or "").strip()
    if dtype.lower() in _TYPE_TITLES:
        return _TYPE_TITLES[dtype.lower()]
    pretty = dtype.replace("_", " ").replace("-", " ").strip()
    return pretty.title() if pretty else "Onboarding document"


def _is_onboarding_document(item: Dict[str, Any]) -> bool:
    blob = " ".join(
        [
            str(item.get("type") or ""),
            str(item.get("category") or ""),
            str(item.get("title") or ""),
            str(item.get("name") or ""),
            str(item.get("tags") or ""),
            str(item.get("blobUrl") or ""),
        ]
    ).lower()
    if "onboard" in blob:
        return True
    return any(hint in blob for hint in _ONBOARDING_TYPE_HINTS)


def get_onboarding_documents() -> list:
    """Return formatted onboarding document lines (`- Title: url`) from Cosmos.

    Never returns empty — hardcoded placeholder links if the query fails or
    yields no usable URLs.
    """
    fallback = [line for line in _FALLBACK_ONBOARDING_DOCS if line.strip()]
    if _use_mock():
        return list(fallback)

    try:
        container = _get_documents_container()
        items = [
            dict(item)
            for item in container.query_items(
                query="SELECT * FROM c",
                enable_cross_partition_query=True,
            )
        ]
        tagged = [item for item in items if _is_onboarding_document(item)]
        chosen = tagged or items
        lines: List[str] = []
        seen = set()
        for item in chosen:
            title = _document_title(item)
            url = _resolve_document_url(item)
            if not url:
                continue
            line = f"- {title}: {url}"
            if line in seen:
                continue
            seen.add(line)
            lines.append(line)
        if lines:
            return lines
    except Exception:
        logger.exception("get_onboarding_documents failed; using fallback links")

    return list(fallback)


def _normalize_doc(item: Dict[str, Any]) -> Dict[str, Any]:
    """Return a plain dict and add friendly aliases for ClosedAI seed schema."""
    if not isinstance(item, dict):
        return {"error": "Invalid employee document."}
    doc = dict(item)
    # ClosedAI seed uses `name`, `hireDate`, `dateOfBirth`, `employeeId`.
    if doc.get("name") and not doc.get("employee_name"):
        doc["employee_name"] = doc["name"]
    if doc.get("hireDate") and not doc.get("start_date"):
        doc["start_date"] = doc["hireDate"]
    if doc.get("dateOfBirth") and not doc.get("dob"):
        doc["dob"] = doc["dateOfBirth"]
    if doc.get("employeeId") and not doc.get("employee_id"):
        doc["employee_id"] = doc["employeeId"]
    return doc


def _matches_search(doc: Dict[str, Any], term: str) -> bool:
    term_l = term.lower().strip()
    if not term_l:
        return False
    email = str(doc.get("personal_email") or doc.get("email") or "").lower()
    first = str(doc.get("first_name") or "").lower()
    last = str(doc.get("last_name") or "").lower()
    # ClosedAI seed uses `name`; onboarding writes may use `employee_name`.
    full = str(
        doc.get("name")
        or doc.get("employee_name")
        or f"{first} {last}"
    ).strip().lower()
    emp_id = str(doc.get("id") or doc.get("employeeId") or doc.get("employee_id") or "").lower()
    role = str(doc.get("role") or "").lower()
    dept = str(doc.get("department") or "").lower()
    return (
        term_l == email
        or term_l in email
        or term_l == emp_id
        or term_l in full
        or term_l in first
        or term_l in last
        or (len(term_l) > 3 and term_l in role)
        or (len(term_l) > 3 and term_l in dept)
    )


def get_employee(search_term: str) -> dict:
    """Query Cosmos (or mock) by email or name; return the full employee record."""
    term = (search_term or "").strip()
    if not term:
        return {"error": "search_term is required."}

    if _use_mock():
        for doc in _mock_employees.values():
            if _matches_search(doc, term):
                return {**_normalize_doc(doc), "_mock": True}
        return {"error": f"No employee found matching '{term}'."}

    try:
        container = _get_container()
        term_l = term.lower()
        # Support ClosedAI seed fields (`name`, `email`, `employeeId`) and
        # onboarding-created fields (`employee_name`, `personal_email`, ...).
        query = """
        SELECT * FROM c
        WHERE LOWER(c.email) = @term
           OR LOWER(c.personal_email) = @term
           OR LOWER(c.id) = @term
           OR LOWER(c.employeeId) = @term
           OR CONTAINS(LOWER(c.name), @term)
           OR CONTAINS(LOWER(c.employee_name), @term)
           OR CONTAINS(LOWER(c.first_name), @term)
           OR CONTAINS(LOWER(c.last_name), @term)
        """
        params: List[Dict[str, Any]] = [{"name": "@term", "value": term_l}]
        results = list(
            container.query_items(
                query=query,
                parameters=params,
                enable_cross_partition_query=True,
            )
        )
        if not results:
            # Broader scan fallback for partial matches / alternate spellings.
            results = [
                item
                for item in container.query_items(
                    query="SELECT * FROM c",
                    enable_cross_partition_query=True,
                )
                if _matches_search(dict(item), term)
            ]
        if not results:
            return {
                "error": (
                    f"No employee found matching '{term}' "
                    f"(database={_database_name()}, container={_container_name()})."
                )
            }
        return _normalize_doc(dict(results[0]))
    except Exception as exc:
        logger.exception("get_employee failed")
        return {"error": f"Failed to look up employee: {exc}"}


def _format_employee_id(n: int) -> str:
    """ClosedAI seed format: emp-0001, emp-0501, …"""
    return f"emp-{int(n):04d}"


def _max_emp_number_from_ids(ids: List[str]) -> int:
    max_n = 0
    for raw in ids:
        for candidate in (raw,):
            m = _EMP_ID_RE.match(str(candidate or "").strip())
            if m:
                max_n = max(max_n, int(m.group(1)))
    return max_n


def _next_employee_id(container=None) -> str:
    """Allocate the next emp-NNNN id after the highest existing employee id."""
    ids: List[str] = []
    if _use_mock() or container is None:
        for doc in _mock_employees.values():
            ids.append(str(doc.get("id") or ""))
            ids.append(str(doc.get("employeeId") or ""))
    else:
        try:
            for item in container.query_items(
                query="SELECT c.id, c.employeeId FROM c",
                enable_cross_partition_query=True,
            ):
                ids.append(str(item.get("id") or ""))
                ids.append(str(item.get("employeeId") or ""))
        except Exception:
            logger.exception("Failed to scan employee ids; falling back to count+1")
    next_n = _max_emp_number_from_ids(ids) + 1
    return _format_employee_id(next_n)


def _to_closedai_employee_doc(employee_data: dict, employee_id: str) -> Dict[str, Any]:
    """Map onboarding / mixed payloads onto the ClosedAI employees schema."""
    first = str(employee_data.get("first_name") or "").strip()
    last = str(employee_data.get("last_name") or "").strip()
    name = str(
        employee_data.get("name")
        or employee_data.get("employee_name")
        or f"{first} {last}".strip()
    ).strip()
    email = str(
        employee_data.get("email") or employee_data.get("personal_email") or ""
    ).strip()
    hire_date = str(
        employee_data.get("hireDate") or employee_data.get("start_date") or ""
    ).strip() or None
    dob = str(
        employee_data.get("dateOfBirth") or employee_data.get("dob") or ""
    ).strip() or None

    doc: Dict[str, Any] = {
        "id": employee_id,
        "employeeId": employee_id,
        "name": name,
        "email": email,
        "company": str(
            employee_data.get("company") or _DEFAULT_COMPANY
        ).strip()
        or _DEFAULT_COMPANY,
        "role": str(employee_data.get("role") or "").strip() or None,
        "department": str(employee_data.get("department") or "").strip() or None,
        "hireDate": hire_date,
        "dateOfBirth": dob,
        "visaType": employee_data.get("visaType", None),
        "status": str(employee_data.get("status") or "active").strip() or "active",
        "manager": employee_data.get("manager", None),
        "engagementScore": employee_data.get("engagementScore", None),
        "lastSurveyDate": employee_data.get("lastSurveyDate", None),
    }

    # Optional onboarding extras (kept without breaking the core schema).
    benefits = employee_data.get("assigned_benefits")
    if benefits is not None:
        doc["assigned_benefits"] = benefits
    if employee_data.get("source"):
        doc["source"] = employee_data.get("source")

    return doc


def create_employee(employee_data: dict) -> dict:
    """Create an employee using the next emp-NNNN id and ClosedAI document shape."""
    if not isinstance(employee_data, dict):
        return {"error": "employee_data must be a dictionary."}

    if _use_mock():
        employee_id = _next_employee_id(None)
        body = _to_closedai_employee_doc(employee_data, employee_id)
        _mock_employees[employee_id] = body
        return {**_normalize_doc(body), "_mock": True}

    try:
        container = _get_container()
        employee_id = _next_employee_id(container)
        # Guard against a rare race: if id already exists, bump until free.
        for _ in range(25):
            try:
                container.read_item(item=employee_id, partition_key=employee_id)
            except CosmosResourceNotFoundError:
                break
            except Exception:
                break
            else:
                # Exists — bump numeric suffix.
                m = _EMP_ID_RE.match(employee_id)
                n = int(m.group(1)) + 1 if m else (_max_emp_number_from_ids([employee_id]) + 1)
                employee_id = _format_employee_id(n)

        body = _to_closedai_employee_doc(employee_data, employee_id)
        saved = container.upsert_item(body=body)
        return _normalize_doc(dict(saved))
    except Exception as exc:
        logger.exception("create_employee failed")
        return {"error": f"Failed to create employee: {exc}"}


def update_employee_field(email: str, field: str, new_value: Any) -> dict:
    """Find an employee by email, update one field, and save the document."""
    email_val = (email or "").strip()
    field_name = (field or "").strip()
    if not email_val:
        return {"error": "email is required."}
    if not field_name:
        return {"error": "field is required."}
    if field_name in ("id", "_rid", "_self", "_etag", "_attachments", "_ts"):
        return {"error": f"Field '{field_name}' cannot be updated."}

    record = get_employee(email_val)
    if record.get("error"):
        return record

    # Prefer exact email match if get_employee returned a name hit.
    record_email = str(
        record.get("personal_email") or record.get("email") or ""
    ).strip().lower()
    if record_email and record_email != email_val.lower():
        # Re-query strictly by email.
        if _use_mock():
            match = None
            for doc in _mock_employees.values():
                e = str(doc.get("personal_email") or doc.get("email") or "").lower()
                if e == email_val.lower():
                    match = doc
                    break
            if not match:
                return {"error": f"No employee found with email '{email_val}'."}
            record = dict(match)
        else:
            try:
                container = _get_container()
                query = """
                SELECT * FROM c
                WHERE LOWER(c.personal_email) = @email OR LOWER(c.email) = @email
                """
                hits = list(
                    container.query_items(
                        query=query,
                        parameters=[{"name": "@email", "value": email_val.lower()}],
                        enable_cross_partition_query=True,
                    )
                )
                if not hits:
                    return {"error": f"No employee found with email '{email_val}'."}
                record = dict(hits[0])
            except Exception as exc:
                return {"error": f"Failed to look up employee by email: {exc}"}

    # Strip aliases we added for the LLM before writing back.
    for alias in ("employee_name", "start_date", "dob", "employee_id"):
        if alias in record and alias not in (
            "name",
            "hireDate",
            "dateOfBirth",
            "employeeId",
        ):
            # Keep aliases only if they were original fields; drop derived ones.
            if alias == "employee_name" and "name" in record:
                record.pop("employee_name", None)
            elif alias == "start_date" and "hireDate" in record:
                record.pop("start_date", None)
            elif alias == "dob" and "dateOfBirth" in record:
                record.pop("dob", None)
            elif alias == "employee_id" and "employeeId" in record:
                record.pop("employee_id", None)

    record[field_name] = new_value
    # Keep ClosedAI `name` in sync if employee_name is updated.
    if field_name in ("name", "employee_name"):
        record["name"] = new_value
        record["employee_name"] = new_value
    record["updated_at"] = _utc_now()
    doc_id = str(record.get("id") or "").strip()
    if not doc_id:
        return {"error": "Employee record is missing id; cannot update."}

    if _use_mock():
        _mock_employees[doc_id] = record
        return {**_normalize_doc(record), "_mock": True}

    try:
        container = _get_container()
        saved = container.replace_item(item=doc_id, body=record)
        return _normalize_doc(dict(saved))
    except CosmosResourceNotFoundError:
        return {"error": f"Employee id '{doc_id}' not found during update."}
    except Exception as exc:
        logger.exception("update_employee_field failed")
        return {"error": f"Failed to update employee: {exc}"}
