from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from azure.cosmos import PartitionKey
from azure.cosmos.aio import CosmosClient
from azure.cosmos.exceptions import CosmosHttpResponseError, CosmosResourceNotFoundError


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


# Default onboarding checklist items (IT provisioning + document signing, etc.)
DEFAULT_ONBOARDING_ITEMS: List[Dict[str, str]] = [
    {"key": "it_provisioning", "label": "IT Provisioning", "status": "Pending"},
    {"key": "laptop_setup", "label": "Laptop Setup", "status": "Pending"},
    {"key": "email_account", "label": "Email Account", "status": "Pending"},
    {"key": "document_signing", "label": "Document Signing", "status": "Pending"},
    {"key": "benefits_enrollment", "label": "Benefits Enrollment", "status": "Pending"},
]


class DatabaseService:
    def __init__(self):
        self.connection_string = os.getenv("COSMOS_CONNECTION_STRING")
        self.database_name = os.getenv("COSMOS_DATABASE_NAME", "closedai-db")
        self._client: Optional[CosmosClient] = None
        self._containers: Dict[str, Any] = {}
        # In-memory fallback when Cosmos is unavailable / USE_MOCK_AZURE=true
        self._mock_store: Dict[str, Dict[str, dict]] = {
            "onboarding_checklists": {},
            "documents": {},
            "candidates": {},
            "training_logs": {},
            "schedules": {},
            "integrations": {},
        }
        self._seed_mock_candidates()

    @property
    def use_mock(self) -> bool:
        if os.getenv("USE_MOCK_AZURE", "false").lower() == "true":
            return True
        return not bool(self.connection_string)

    async def _get_client(self) -> CosmosClient:
        if self._client is not None:
            return self._client
        if not self.connection_string:
            raise ValueError("COSMOS_CONNECTION_STRING is not set.")
        self._client = CosmosClient.from_connection_string(self.connection_string)
        return self._client

    async def _get_container(self, container_name: str):
        if container_name in self._containers:
            return self._containers[container_name]

        client = await self._get_client()
        database = client.get_database_client(self.database_name)
        try:
            container = await database.create_container_if_not_exists(
                id=container_name,
                partition_key=PartitionKey(path="/id"),
            )
        except CosmosHttpResponseError:
            # Container may already exist under a different throughput model.
            container = database.get_container_client(container_name)

        self._containers[container_name] = container
        return container

    async def close(self):
        if self._client is not None:
            await self._client.close()
            self._client = None
            self._containers.clear()

    # ------------------------------------------------------------------
    # Onboarding checklists
    # ------------------------------------------------------------------

    async def create_onboarding_checklist(
        self,
        employee_name: str,
        role: str,
        department: str,
    ) -> dict:
        employee_id = str(uuid.uuid4())
        record = {
            "id": employee_id,
            "employee_id": employee_id,
            "employee_name": employee_name.strip(),
            "role": role.strip(),
            "department": department.strip(),
            "status": "in_progress",
            "checklist": [dict(item) for item in DEFAULT_ONBOARDING_ITEMS],
            "created_at": _utc_now(),
            "updated_at": _utc_now(),
        }

        if self.use_mock:
            self._mock_store["onboarding_checklists"][employee_id] = record
            return {**record, "_mock": True}

        container = await self._get_container("onboarding_checklists")
        created = await container.create_item(body=record)
        return dict(created)

    async def get_onboarding_checklist(self, employee_id: str) -> dict:
        if self.use_mock:
            item = self._mock_store["onboarding_checklists"].get(employee_id)
            if not item:
                return {"error": f"Onboarding checklist for employee_id '{employee_id}' not found."}
            return {**item, "_mock": True}

        container = await self._get_container("onboarding_checklists")
        try:
            item = await container.read_item(item=employee_id, partition_key=employee_id)
            return dict(item)
        except CosmosResourceNotFoundError:
            return {"error": f"Onboarding checklist for employee_id '{employee_id}' not found."}

    async def update_checklist_item(
        self,
        employee_id: str,
        item_key: str,
        status: str,
    ) -> dict:
        employee_id = (employee_id or "").strip()
        item_key = (item_key or "").strip()
        status = (status or "").strip()
        if not employee_id:
            return {"error": "employee_id is required."}
        if not item_key:
            return {"error": "item_key is required (e.g. 'it_provisioning', 'document_signing')."}
        if not status:
            return {"error": "status is required (e.g. 'Pending', 'Completed')."}

        record = await self.get_onboarding_checklist(employee_id)
        if "error" in record:
            return record

        checklist = list(record.get("checklist") or [])
        matched = False
        for item in checklist:
            if item.get("key") == item_key:
                item["status"] = status
                matched = True
                break

        if not matched:
            known = [i.get("key") for i in checklist]
            return {
                "error": (
                    f"Unknown item_key '{item_key}'. "
                    f"Valid keys: {', '.join(known) if known else '(none)'}."
                )
            }

        record["checklist"] = checklist
        record["updated_at"] = _utc_now()
        # Mark overall complete when every item is Completed.
        if checklist and all(
            str(i.get("status", "")).lower() == "completed" for i in checklist
        ):
            record["status"] = "completed"
        else:
            record["status"] = "in_progress"

        if self.use_mock or record.get("_mock"):
            record.pop("_mock", None)
            self._mock_store["onboarding_checklists"][employee_id] = record
            return {**record, "_mock": True}

        container = await self._get_container("onboarding_checklists")
        # Strip Cosmos system props that can break replace if we echoed them oddly.
        body = {k: v for k, v in record.items() if not k.startswith("_")}
        updated = await container.replace_item(item=employee_id, body=body)
        return dict(updated)

    # ------------------------------------------------------------------
    # Documents (offer letters, etc.)
    # ------------------------------------------------------------------

    async def save_document(self, document: dict) -> dict:
        doc_id = document.get("id") or str(uuid.uuid4())
        record = {
            **document,
            "id": doc_id,
            "created_at": document.get("created_at") or _utc_now(),
            "updated_at": _utc_now(),
        }

        if self.use_mock:
            self._mock_store["documents"][doc_id] = record
            return {**record, "_mock": True}

        container = await self._get_container("documents")
        created = await container.create_item(body=record)
        return dict(created)

    async def get_document(self, document_id: str) -> dict:
        if self.use_mock:
            item = self._mock_store["documents"].get(document_id)
            if not item:
                return {"error": f"Document '{document_id}' not found."}
            return {**item, "_mock": True}

        container = await self._get_container("documents")
        try:
            item = await container.read_item(item=document_id, partition_key=document_id)
            return dict(item)
        except CosmosResourceNotFoundError:
            return {"error": f"Document '{document_id}' not found."}

    # ------------------------------------------------------------------
    # Candidates / training / schedules
    # ------------------------------------------------------------------

    def _seed_mock_candidates(self) -> None:
        """Seed a small recruiting pool for local / mock runs."""
        if self._mock_store["candidates"]:
            return
        seeds = [
            {
                "id": "cand-001",
                "name": "Jordan Lee",
                "job_role": "Software Engineer",
                "skills": ["python", "react", "sql", "azure"],
                "years_experience": 5,
                "summary": "Full-stack engineer with Azure and HR systems experience.",
            },
            {
                "id": "cand-002",
                "name": "Samira Patel",
                "job_role": "Software Engineer",
                "skills": ["python", "typescript", "kubernetes", "sql"],
                "years_experience": 7,
                "summary": "Backend-focused engineer; strong data and platform skills.",
            },
            {
                "id": "cand-003",
                "name": "Chris Nguyen",
                "job_role": "Software Engineer",
                "skills": ["javascript", "react", "css", "figma"],
                "years_experience": 4,
                "summary": "Frontend specialist with design-system experience.",
            },
            {
                "id": "cand-004",
                "name": "Avery Brooks",
                "job_role": "HR Business Partner",
                "skills": ["employee relations", "coaching", "compliance", "workday"],
                "years_experience": 8,
                "summary": "Seasoned HRBP across multi-site orgs.",
            },
            {
                "id": "cand-005",
                "name": "Riley Chen",
                "job_role": "HR Business Partner",
                "skills": ["recruiting", "onboarding", "compliance", "excel"],
                "years_experience": 3,
                "summary": "People ops generalist pivoting into HRBP work.",
            },
            {
                "id": "cand-006",
                "name": "Morgan Diaz",
                "job_role": "People Operations Specialist",
                "skills": ["onboarding", "scheduling", "workday", "excel"],
                "years_experience": 4,
                "summary": "Ops specialist focused on workforce scheduling.",
            },
        ]
        for c in seeds:
            self._mock_store["candidates"][c["id"]] = {**c, "created_at": _utc_now()}

    async def upsert_candidate(self, candidate: dict) -> dict:
        try:
            cand_id = candidate.get("id") or str(uuid.uuid4())
            record = {
                **candidate,
                "id": cand_id,
                "updated_at": _utc_now(),
                "created_at": candidate.get("created_at") or _utc_now(),
            }
            if self.use_mock:
                self._mock_store["candidates"][cand_id] = record
                return {**record, "_mock": True}
            container = await self._get_container("candidates")
            saved = await container.upsert_item(body=record)
            return dict(saved)
        except Exception as exc:
            return {"error": f"Unable to upsert candidate: {exc}"}

    async def list_candidates_by_role(self, job_role: str) -> List[dict]:
        role = (job_role or "").strip()
        if not role:
            return []

        if self.use_mock:
            self._seed_mock_candidates()
            return [
                {**c, "_mock": True}
                for c in self._mock_store["candidates"].values()
                if str(c.get("job_role", "")).lower() == role.lower()
            ]

        container = await self._get_container("candidates")
        query = "SELECT * FROM c WHERE LOWER(c.job_role) = LOWER(@role)"
        parameters = [{"name": "@role", "value": role}]
        results: List[dict] = []
        async for item in container.query_items(query=query, parameters=parameters):
            results.append(dict(item))
        return results

    async def upsert_training_log(self, training_log: dict) -> dict:
        try:
            log_id = training_log.get("id") or str(uuid.uuid4())
            record = {
                **training_log,
                "id": log_id,
                "status": training_log.get("status") or "Pending",
                "updated_at": _utc_now(),
                "created_at": training_log.get("created_at") or _utc_now(),
            }
            if self.use_mock:
                self._mock_store["training_logs"][log_id] = record
                return {**record, "_mock": True}
            container = await self._get_container("training_logs")
            saved = await container.upsert_item(body=record)
            return dict(saved)
        except Exception as exc:
            return {"error": f"Unable to upsert training log: {exc}"}

    async def upsert_schedule(self, schedule: dict) -> dict:
        try:
            sched_id = schedule.get("id") or str(uuid.uuid4())
            record = {
                **schedule,
                "id": sched_id,
                "updated_at": _utc_now(),
                "created_at": schedule.get("created_at") or _utc_now(),
            }
            if self.use_mock:
                self._mock_store["schedules"][sched_id] = record
                return {**record, "_mock": True}
            container = await self._get_container("schedules")
            saved = await container.upsert_item(body=record)
            return dict(saved)
        except Exception as exc:
            return {"error": f"Unable to upsert schedule: {exc}"}

    # ------------------------------------------------------------------
    # Integrations (OAuth tokens per user / service)
    # ------------------------------------------------------------------

    @staticmethod
    def _integration_id(user_id: str, service_name: str) -> str:
        return f"{user_id}:{service_name}"

    async def upsert_user_tokens(self, user_id: str, tokens: dict) -> dict:
        """Store / refresh OAuth tokens for a user integration.

        `tokens` must include a `service` (or `service_name`) key, e.g. \"gmail\".
        Remaining keys are persisted as the credential payload.
        """
        try:
            uid = (user_id or "").strip()
            if not uid:
                return {"error": "user_id is required."}

            service = (
                (tokens or {}).get("service")
                or (tokens or {}).get("service_name")
                or "gmail"
            )
            service = str(service).strip().lower()
            if not service:
                return {"error": "service name is required on tokens."}

            token_payload = {
                k: v
                for k, v in (tokens or {}).items()
                if k not in ("service", "service_name", "id", "user_id")
            }
            doc_id = self._integration_id(uid, service)
            existing = await self.get_user_tokens(uid, service)
            created_at = (
                existing.get("created_at")
                if isinstance(existing, dict) and existing.get("created_at")
                else _utc_now()
            )
            record = {
                "id": doc_id,
                "user_id": uid,
                "service": service,
                "tokens": token_payload,
                "connected": True,
                "created_at": created_at,
                "updated_at": _utc_now(),
            }

            if self.use_mock:
                self._mock_store["integrations"][doc_id] = record
                return {**record, "_mock": True}

            container = await self._get_container("integrations")
            saved = await container.upsert_item(body=record)
            return dict(saved)
        except Exception as exc:
            return {"error": f"Unable to upsert integration tokens: {exc}"}

    async def get_user_tokens(self, user_id: str, service_name: str) -> Optional[dict]:
        """Return the integration document for user/service, or None if missing."""
        uid = (user_id or "").strip()
        service = (service_name or "").strip().lower()
        if not uid or not service:
            return None

        doc_id = self._integration_id(uid, service)

        if self.use_mock:
            item = self._mock_store["integrations"].get(doc_id)
            return {**item, "_mock": True} if item else None

        container = await self._get_container("integrations")
        try:
            item = await container.read_item(item=doc_id, partition_key=doc_id)
            return dict(item)
        except CosmosResourceNotFoundError:
            return None
        except Exception:
            return None

    async def delete_user_tokens(self, user_id: str, service_name: str) -> bool:
        """Remove stored tokens for a user/service. Returns True if deleted or absent."""
        uid = (user_id or "").strip()
        service = (service_name or "").strip().lower()
        if not uid or not service:
            return False

        doc_id = self._integration_id(uid, service)

        if self.use_mock:
            self._mock_store["integrations"].pop(doc_id, None)
            return True

        container = await self._get_container("integrations")
        try:
            await container.delete_item(item=doc_id, partition_key=doc_id)
            return True
        except CosmosResourceNotFoundError:
            return True
        except Exception:
            return False


db_service = DatabaseService()
