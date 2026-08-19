"""Seed Cosmos + Blob with synthetic enterprise data (Faker + optional LiteLLM)."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

# Allow `python scripts/seed_data.py` from repo or backend/
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env", override=True)


def _pdf_bytes(title: str, body: str) -> bytes:
    try:
        import fitz

        doc = fitz.open()
        page = doc.new_page()
        page.insert_text((72, 72), title, fontsize=16)
        page.insert_text((72, 110), body, fontsize=11)
        data = doc.tobytes()
        doc.close()
        return data
    except Exception:
        # Minimal one-page PDF
        return (
            b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
            b"2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n"
            b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\n"
            b"trailer<</Root 1 0 R>>\n%%EOF\n"
        )


_BAND_FAMILIES = [
    ("Engineering", "SDE 1", 95000, 125000),
    ("Engineering", "Software Engineer", 130000, 185000),
    ("Engineering", "Staff Engineer", 180000, 240000),
    ("People", "HR Business Partner", 95000, 140000),
    ("Finance", "Financial Analyst", 85000, 125000),
    ("Sales", "Account Executive", 90000, 160000),
]


def _band_doc(fam: str, title: str, lo: int, hi: int) -> dict:
    return {
        "id": f"band-{fam.lower()}-{title.lower().replace(' ', '-')}",
        "jobFamily": fam,
        "level": title,
        "minSalary": lo,
        "maxSalary": hi,
        "benefitsSummary": (
            "Medical and dental coverage, 401(k) with employer match, "
            "and paid time off per company policy."
        ),
    }


def seed_bands_only() -> None:
    """Create compensation_bands container + upsert band docs (no employee seed)."""
    from azure.cosmos import PartitionKey

    from core.config import get_settings
    from tools.azure_cosmos import get_client

    settings = get_settings()
    db = get_client().create_database_if_not_exists(id=settings.cosmos_database)
    try:
        bands = db.create_container_if_not_exists(
            id=settings.cosmos_bands,
            partition_key=PartitionKey(path="/jobFamily"),
        )
    except Exception:
        bands = db.get_container_client(settings.cosmos_bands)
    for fam, title, lo, hi in _BAND_FAMILIES:
        bands.upsert_item(_band_doc(fam, title, lo, hi))
    print(f"Seeded {len(_BAND_FAMILIES)} compensation bands into {settings.cosmos_bands}.")


def seed_tickets_only() -> None:
    """Upsert intake demo tickets from scripts/data/intake_tickets.json."""
    import json

    from core.config import get_settings
    from tools.azure_cosmos import ensure_container, get_client

    data_path = Path(__file__).resolve().parent / "data" / "intake_tickets.json"
    if not data_path.exists():
        print(f"Missing ticket seed file: {data_path}")
        return
    rows = json.loads(data_path.read_text(encoding="utf-8"))
    settings = get_settings()
    get_client()
    container = ensure_container(settings.cosmos_tickets, partition_path="/employeeId")
    for row in rows:
        container.upsert_item(body=row)
    print(f"Seeded {len(rows)} intake tickets into {settings.cosmos_tickets}.")


def seed_cosmos(n_employees: int = 25) -> None:
    from faker import Faker

    from azure.cosmos import PartitionKey
    from core.config import get_settings
    from tools.azure_cosmos import ensure_container, get_client

    fake = Faker()
    settings = get_settings()
    client = get_client()
    db = client.create_database_if_not_exists(id=settings.cosmos_database)

    employees = ensure_container(settings.cosmos_employees, partition_path="/id")
    try:
        bands = db.create_container_if_not_exists(
            id=settings.cosmos_bands,
            partition_key=PartitionKey(path="/jobFamily"),
        )
    except Exception:
        bands = db.get_container_client(settings.cosmos_bands)
    checklists = ensure_container(settings.cosmos_checklists, partition_path="/employeeId")

    families = _BAND_FAMILIES
    for fam, title, lo, hi in families:
        bands.upsert_item(_band_doc(fam, title, lo, hi))

    depts = ["Engineering", "People", "Finance", "Sales", "Operations"]
    import random

    for i in range(1, n_employees + 1):
        emp_id = f"emp-seed-{i:04d}"
        dept = random.choice(depts)
        employees.upsert_item(
            {
                "id": emp_id,
                "employeeId": emp_id,
                "name": fake.name(),
                "email": fake.unique.email(),
                "company": "ClosedAI",
                "role": fake.job(),
                "department": dept,
                "hireDate": fake.date_between(start_date="-8y", end_date="-30d").isoformat(),
                "dateOfBirth": fake.date_of_birth(minimum_age=22, maximum_age=62).isoformat(),
                "status": "active",
                "annualSalary": int(fake.random_int(80000, 220000)),
                "employmentType": "W-2",
                "manager": None,
            }
        )
        if i <= 5:
            checklists.upsert_item(
                {
                    "id": emp_id,
                    "employeeId": emp_id,
                    "employee_name": fake.name(),
                    "role": "New Hire",
                    "department": dept,
                    "status": "in_progress",
                    "background_check": False,
                    "profile_setup": False,
                    "email_setup": False,
                    "i9_signed": False,
                    "nda_required": True,
                    "nda_signed": False,
                    "emergency_contact": False,
                    "training_checklist": False,
                }
            )
    print(f"Seeded {n_employees} employees, {len(families)} bands, sample checklists.")
    _enrich_with_litellm(employees)


def _enrich_with_litellm(employees) -> None:
    """Optional LiteLLM bios for a few records; skipped if no API key."""
    try:
        from litellm import completion

        from core.config import get_settings
        from core.litellm_compat import ensure_litellm_models

        ensure_litellm_models()

        kwargs = get_settings().litellm_kwargs()
        if not kwargs.get("api_key"):
            return
        resp = completion(
            messages=[
                {
                    "role": "user",
                    "content": "Write 3 short one-sentence HR bios for fictional employees at a software company. Return plain lines only.",
                }
            ],
            max_tokens=200,
            **kwargs,
        )
        text = resp.choices[0].message.content or ""
        lines = [ln.strip("- ").strip() for ln in text.splitlines() if ln.strip()]
        for i, bio in enumerate(lines[:3], start=1):
            emp_id = f"emp-seed-{i:04d}"
            try:
                item = employees.read_item(item=emp_id, partition_key=emp_id)
                item["bio"] = bio
                employees.upsert_item(item)
            except Exception:
                pass
        print("Added LiteLLM bios to first seed employees.")
    except Exception as exc:
        print(f"LiteLLM enrichment skipped: {exc}")


def seed_blobs() -> None:
    from azure.storage.blob import BlobServiceClient, ContentSettings

    from core.config import get_settings

    settings = get_settings()
    if not settings.blob_connection_string:
        print("Skipping blob seed: AZURE_BLOB_CONNECTION_STRING unset")
        return
    svc = BlobServiceClient.from_connection_string(settings.blob_connection_string)
    container = svc.get_container_client(settings.blob_container)
    try:
        container.create_container()
    except Exception:
        pass
    files = {
        "onboarding/I-9.pdf": ("Form I-9", "Employment Eligibility Verification (mock)."),
        "onboarding/NDA.pdf": ("NDA / Non-Compete", "Confidentiality and non-compete (mock)."),
        "onboarding/Emergency_Contact.pdf": ("Emergency Contact", "Emergency contact form (mock)."),
        "policies/2026_Handbook.pdf": ("Employee Handbook 2026", "Company policies (mock)."),
    }
    for path, (title, body) in files.items():
        data = _pdf_bytes(title, body)
        container.upload_blob(
            name=path,
            data=data,
            overwrite=True,
            content_settings=ContentSettings(content_type="application/pdf"),
        )
        print("uploaded", path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--employees", type=int, default=25)
    parser.add_argument("--skip-blob", action="store_true")
    parser.add_argument(
        "--bands-only",
        action="store_true",
        help="Only create/upsert compensation_bands (skip employees and blobs).",
    )
    parser.add_argument(
        "--tickets-only",
        action="store_true",
        help="Only upsert intake demo tickets from scripts/data/intake_tickets.json.",
    )
    args = parser.parse_args()
    if args.bands_only:
        seed_bands_only()
        return
    if args.tickets_only:
        seed_tickets_only()
        return
    seed_cosmos(args.employees)
    if not args.skip_blob:
        seed_blobs()


if __name__ == "__main__":
    main()
