"""Azure Blob Storage helpers for onboarding form links."""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

_FALLBACK_LINKS = (
    "- Form I-9: [https://placeholder.link/i9](https://placeholder.link/i9)\n"
    "- Employee NDA & Compliance: [https://placeholder.link/nda](https://placeholder.link/nda)\n"
    "- Emergency Contact Form: [https://placeholder.link/emergency](https://placeholder.link/emergency)"
)


def get_onboarding_document_links() -> str:
    """List onboarding blobs as markdown lines; never return empty.

    `list_blobs()` is an ItemPaged generator and is always truthy — materialize
    with `list(...)` before checking length.
    """
    fallback_links = _FALLBACK_LINKS

    try:
        from azure.storage.blob import BlobServiceClient

        conn_str = (os.getenv("AZURE_BLOB_CONNECTION_STRING") or "").strip().strip('"')
        container_name = (
            os.getenv("BLOB_CONTAINER_NAME") or "onboarding_forms"
        ).strip().strip('"')

        if not conn_str:
            return fallback_links

        blob_service_client = BlobServiceClient.from_connection_string(conn_str)
        container_client = blob_service_client.get_container_client(container_name)

        # Force the generator into a list to accurately check length
        blobs = list(container_client.list_blobs())

        if len(blobs) == 0:
            return fallback_links

        links = []
        for blob in blobs:
            # Construct the public URL (or SAS if configured later)
            account_url = blob_service_client.primary_endpoint.rstrip("/") + "/"
            url = f"{account_url}{container_name}/{blob.name}"
            links.append(f"- {blob.name}: {url}")

        joined = "\n".join(links)
        return joined if joined.strip() else fallback_links

    except Exception as e:
        print(f"Blob fetch error: {e}")
        logger.exception("Blob fetch error")
        return fallback_links
