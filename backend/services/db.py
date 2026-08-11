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
        }

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


db_service = DatabaseService()
