"""Direct Azure Blob tools: list, fetch bytes, inline SAS URLs."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Tuple

from azure.storage.blob import BlobSasPermissions, BlobServiceClient, generate_blob_sas

from core.config import get_settings

logger = logging.getLogger(__name__)

_FALLBACK_LINKS = (
    "- Form I-9: onboarding/I-9.pdf (Azure Blob; run scripts/seed_data.py if missing)\n"
    "- Employee NDA & Compliance: onboarding/NDA.pdf\n"
    "- Emergency Contact Form: onboarding/Emergency_Contact.pdf"
)


def _client() -> BlobServiceClient:
    settings = get_settings()
    if not settings.blob_connection_string:
        raise ValueError("AZURE_BLOB_CONNECTION_STRING is not set.")
    return BlobServiceClient.from_connection_string(settings.blob_connection_string)


def list_onboarding_blobs() -> List[str]:
    """Materialize ItemPaged into a list before checking emptiness."""
    settings = get_settings()
    try:
        svc = _client()
        container = svc.get_container_client(settings.blob_container)
        blobs = list(container.list_blobs())
        if len(blobs) == 0:
            return []
        return [b.name for b in blobs]
    except Exception:
        logger.exception("list_onboarding_blobs failed")
        return []


def fetch_blob_bytes(blob_name: str) -> bytes:
    settings = get_settings()
    container = _client().get_container_client(settings.blob_container)
    downloader = container.download_blob(blob_name)
    return downloader.readall()


def generate_inline_sas_url(blob_name: str, hours: Optional[int] = None) -> str:
    """Time-bound SAS with Content-Disposition: inline so PDFs open in-browser."""
    settings = get_settings()
    account_name, account_key = settings.blob_account()
    if not account_name or not account_key:
        raise ValueError("Blob account name/key could not be parsed from connection string.")
    expiry = datetime.now(timezone.utc) + timedelta(hours=hours or settings.blob_sas_hours)
    filename = blob_name.split("/")[-1]
    sas = generate_blob_sas(
        account_name=account_name,
        container_name=settings.blob_container,
        blob_name=blob_name,
        account_key=account_key,
        permission=BlobSasPermissions(read=True),
        expiry=expiry,
        content_disposition=f'inline; filename="{filename}"',
    )
    return (
        f"https://{account_name}.blob.core.windows.net/"
        f"{settings.blob_container}/{blob_name}?{sas}"
    )


_DOC_ALIASES = {
    "i9": ("i-9", "i9", "form-i-9", "form_i9"),
    "nda": ("nda", "non-compete", "noncompete", "non_compete"),
    "emergency": ("emergency", "emergency_contact", "emergency-contact"),
}


def resolve_onboarding_doc_urls(*, include_nda: bool = True) -> dict:
    """Map I-9 / NDA / emergency-contact blobs to inline SAS URLs."""
    names = list_onboarding_blobs()
    out: dict = {}
    for key, aliases in _DOC_ALIASES.items():
        if key == "nda" and not include_nda:
            continue
        match = None
        for name in names:
            lower = name.lower()
            if any(a in lower for a in aliases):
                match = name
                break
        rec: dict = {"blob": match, "url": ""}
        if match:
            try:
                rec["url"] = generate_inline_sas_url(match)
            except Exception:
                logger.exception("SAS generation failed for %s", match)
        out[key] = rec
    return out


def get_onboarding_document_links(*, include_noncompete: bool = True) -> str:
    """Markdown bullet list of onboarding docs (SAS URLs). Never empty."""
    names = list_onboarding_blobs()
    if not names:
        return _FALLBACK_LINKS

    lines: List[str] = []
    for name in names:
        lower = name.lower()
        if not include_noncompete and any(
            token in lower for token in ("nda", "non-compete", "noncompete", "non_compete")
        ):
            continue
        try:
            url = generate_inline_sas_url(name)
        except Exception:
            settings = get_settings()
            account, _ = settings.blob_account()
            url = f"https://{account}.blob.core.windows.net/{settings.blob_container}/{name}"
        lines.append(f"- {name}: {url}")
    if not lines:
        return _FALLBACK_LINKS
    return "\n".join(lines)


def save_resume_to_blob(file_bytes: bytes, filename: str, requisition_id: str) -> dict:
    """Upload a candidate resume under candidates/{requisition_id}/ virtual dir."""
    settings = get_settings()
    safe_req = (requisition_id or "unassigned").strip().replace("/", "-") or "unassigned"
    safe_name = (filename or "resume").split("/")[-1].split("\\")[-1]
    blob_name = f"candidates/{safe_req}/{safe_name}"
    try:
        container = _client().get_container_client(settings.blob_container)
        container.upload_blob(name=blob_name, data=file_bytes, overwrite=True)
        return {"ok": True, "blob": blob_name}
    except Exception as exc:
        logger.exception("save_resume_to_blob failed")
        return {"ok": False, "error": str(exc), "blob": blob_name}


def download_named_pdfs(blob_names: List[str]) -> List[Tuple[str, bytes]]:
    out: List[Tuple[str, bytes]] = []
    for name in blob_names:
        try:
            out.append((name.split("/")[-1], fetch_blob_bytes(name)))
        except Exception:
            logger.exception("Failed to fetch blob %s", name)
    return out
