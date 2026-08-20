"""Environment and Azure client settings."""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Any, Dict, Tuple


def _strip(value: str | None, default: str = "") -> str:
    return (value or default).strip().strip('"')


class Settings:
    def __init__(self) -> None:
        self.frontend_url = _strip(os.getenv("FRONTEND_URL"), "http://localhost:3000").rstrip("/")
        self.jwt_secret = _strip(os.getenv("JWT_SECRET")) or "dev-only-hr-copilot-jwt-secret-change-me"
        self.jwt_expire_days = int(os.getenv("JWT_EXPIRE_DAYS") or "7")
        self.default_user_id = _strip(os.getenv("DEFAULT_USER_ID"), "test_user")

        self.llm_provider = _strip(os.getenv("LLM_PROVIDER"), "openai").lower()
        self.openai_api_key = _strip(os.getenv("OPENAI_API_KEY"))
        self.openai_model = _strip(os.getenv("OPENAI_MODEL") or os.getenv("LLM_MODEL"), "gpt-4o")
        self.openai_base_url = _strip(os.getenv("OPENAI_BASE_URL") or os.getenv("OPENAI_API_BASE")).rstrip("/")

        self.cosmos_endpoint = _strip(os.getenv("COSMOS_ENDPOINT"))
        self.cosmos_key = _strip(os.getenv("COSMOS_KEY"))
        self.cosmos_connection_string = _strip(os.getenv("COSMOS_CONNECTION_STRING"))
        self.cosmos_database = _strip(os.getenv("COSMOS_DATABASE_NAME"), "closedai-db")
        self.cosmos_employees = _strip(os.getenv("COSMOS_CONTAINER_NAME"), "employees")
        self.cosmos_documents = _strip(os.getenv("COSMOS_DOCUMENTS_CONTAINER"), "documents")
        self.cosmos_bands = _strip(os.getenv("COSMOS_BANDS_CONTAINER"), "compensation_bands")
        self.cosmos_checklists = _strip(os.getenv("COSMOS_CHECKLISTS_CONTAINER"), "onboarding_checklists")
        self.cosmos_integrations = _strip(os.getenv("COSMOS_INTEGRATIONS_CONTAINER"), "integrations")
        self.cosmos_applicants = _strip(os.getenv("COSMOS_APPLICANTS_CONTAINER"), "applicants")
        self.cosmos_tickets = _strip(os.getenv("COSMOS_TICKETS_CONTAINER"), "hr_tickets")
        self.cosmos_work = _strip(os.getenv("COSMOS_WORK_CONTAINER"), "work_items")
        self.cosmos_timesheets = _strip(os.getenv("COSMOS_TIMESHEETS_CONTAINER"), "timesheets")
        self.cosmos_payroll = _strip(os.getenv("COSMOS_PAYROLL_CONTAINER"), "payroll_runs")

        self.blob_connection_string = _strip(os.getenv("AZURE_BLOB_CONNECTION_STRING"))
        self.blob_container = _strip(os.getenv("BLOB_CONTAINER_NAME"), "onboarding-forms")
        self.blob_sas_hours = int(os.getenv("BLOB_SAS_HOURS") or "24")

        self.msal_client_id = _strip(os.getenv("MSAL_CLIENT_ID") or os.getenv("AZURE_AD_CLIENT_ID"))
        self.msal_client_secret = _strip(os.getenv("MSAL_CLIENT_SECRET") or os.getenv("AZURE_AD_CLIENT_SECRET"))
        self.msal_tenant_id = _strip(os.getenv("MSAL_TENANT_ID") or os.getenv("AZURE_AD_TENANT_ID"))
        self.msal_redirect_uri = _strip(
            os.getenv("MSAL_REDIRECT_URI"),
            "http://localhost:8000/api/v1/auth/microsoft/callback",
        )
        self.msal_graph_scopes = [
            s.strip()
            for s in _strip(
                os.getenv("MSAL_GRAPH_SCOPES"),
                "https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Chat.ReadWrite",
            ).split()
            if s.strip()
        ]

        self.linkedin_client_id = _strip(os.getenv("LINKEDIN_CLIENT_ID"))
        self.linkedin_client_secret = _strip(os.getenv("LINKEDIN_CLIENT_SECRET"))

    def cosmos_credentials(self) -> Tuple[str, str]:
        if self.cosmos_endpoint and self.cosmos_key:
            return self.cosmos_endpoint, self.cosmos_key
        conn = self.cosmos_connection_string
        endpoint, key = "", ""
        text = conn
        if text.lower().startswith("http") and "accountendpoint=" not in text.lower():
            text = f"AccountEndpoint={text}"
        for part in text.split(";"):
            if "=" not in part:
                continue
            name, value = part.split("=", 1)
            n = name.strip().lower()
            if n == "accountendpoint":
                endpoint = value.strip()
            elif n == "accountkey":
                key = value.strip()
        return endpoint, key

    def blob_account(self) -> Tuple[str, str]:
        """Return (account_name, account_key) from the blob connection string."""
        name, key = "", ""
        for part in self.blob_connection_string.split(";"):
            if "=" not in part:
                continue
            k, v = part.split("=", 1)
            kl = k.strip().lower()
            if kl == "accountname":
                name = v.strip()
            elif kl == "accountkey":
                key = v.strip()
        return name, key

    def litellm_kwargs(self) -> Dict[str, Any]:
        model = self.openai_model
        if "/" not in model:
            model = f"openai/{model}"
        kwargs: Dict[str, Any] = {"model": model}
        if self.openai_api_key:
            kwargs["api_key"] = self.openai_api_key
        if self.openai_base_url:
            kwargs["api_base"] = self.openai_base_url
        return kwargs


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
