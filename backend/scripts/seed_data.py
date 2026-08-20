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


def seed_payroll_only() -> None:
    """Seed timesheets + payroll runs for all employees across recent pay periods."""
    import random
    from datetime import date, timedelta

    from core.config import get_settings
    from core.security.scope_context import apply_scope_flags
    from services.payroll import current_pay_period_id
    from tools.azure_cosmos import create_timesheet, ensure_container, get_client, upsert_payroll_run

    settings = get_settings()
    get_client()
    apply_scope_flags(bypass=True, hr_allowed=True, employee_lookup=True)
    employees_container = ensure_container(settings.cosmos_employees, partition_path="/id")
    employees = list(
        employees_container.query_items(
            query="SELECT * FROM c",
            enable_cross_partition_query=True,
        )
    )
    if not employees:
        print("No employees found — run employee seed first.")
        return

    current = current_pay_period_id()
    try:
        current_idx = int(current.split("-PP")[1])
    except (IndexError, ValueError):
        current_idx = 17
    year = int(current.split("-PP")[0]) if "-PP" in current else 2026

    period_defs: list[tuple[str, str, str, bool]] = []
    for idx in range(max(1, current_idx - 6), current_idx + 1):
        start = date(year, 1, 1) + timedelta(days=(idx - 1) * 14)
        end = start + timedelta(days=13)
        pid = f"{year}-PP{idx:02d}"
        period_defs.append((pid, start.isoformat(), end.isoformat(), idx == current_idx))

    rng = random.Random(42)
    missing_pool = rng.sample(employees, min(4, len(employees)))
    missing_ids = {str(e.get("employeeId") or e.get("id") or "") for e in missing_pool}

    for period_id, start, end, is_current in period_defs:
        period_docs: list[dict] = []
        for emp in employees:
            emp_id = str(emp.get("employeeId") or emp.get("id") or "")
            if not emp_id:
                continue
            name = str(emp.get("name") or "Employee")
            dept = str(emp.get("department") or "")
            salary = float(emp.get("annualSalary") or 100000)
            hourly = round(salary / 2080.0, 2)
            regular = 80.0
            ot = 0.0
            if rng.random() < 0.12:
                ot = rng.choice([16.0, 18.0, 20.0])
            elif rng.random() < 0.08:
                ot = rng.uniform(2.0, 6.0)
            total = regular + ot
            gross = round(hourly * regular + hourly * 1.5 * ot, 2)

            entries = []
            for d in range(10):
                day = date.fromisoformat(start) + timedelta(days=d)
                if day.weekday() >= 5:
                    continue
                h = 8.0
                if ot > 15 and d == 9:
                    h = 10.0
                entries.append(
                    {
                        "date": day.isoformat(),
                        "hours": h,
                        "type": "regular",
                        "project": dept or "General",
                    }
                )
            if ot > 0:
                entries.append(
                    {
                        "date": end,
                        "hours": ot,
                        "type": "overtime",
                        "project": dept or "General",
                    }
                )

            anomalies: list[str] = []
            if ot > 15:
                anomalies.append(f"High overtime ({ot}h)")
            if is_current and emp_id in missing_ids:
                status = "open"
                submitted_at = None
                approved_at = None
            elif is_current:
                status = rng.choice(["submitted", "submitted", "approved"])
                submitted_at = (date.fromisoformat(end) - timedelta(days=1)).isoformat()
                approved_at = submitted_at if status == "approved" else None
            else:
                status = "paid"
                submitted_at = (date.fromisoformat(end) - timedelta(days=2)).isoformat()
                approved_at = submitted_at

            doc = create_timesheet(
                employee_id=emp_id,
                pay_period_id=period_id,
                pay_period_start=start,
                pay_period_end=end,
                employee_name=name,
                department=dept,
                status=status,
                entries=entries,
                regular_hours=regular,
                overtime_hours=ot,
                pto_hours=0,
                total_hours=total,
                hourly_rate=hourly,
                gross_pay=gross,
                anomalies=anomalies,
                submitted_at=submitted_at or "",
                approved_at=approved_at or "",
            )
            period_docs.append(doc)

        missing_count = sum(1 for d in period_docs if d.get("status") == "open")
        submitted_count = sum(
            1 for d in period_docs if str(d.get("status") or "") in ("submitted", "approved", "paid")
        )
        total_gross = sum(float(d.get("grossPay") or 0) for d in period_docs)
        total_ot = sum(float(d.get("overtimeHours") or 0) for d in period_docs)
        by_department: dict = {}
        exceptions: list[dict] = []
        for row in period_docs:
            dept = str(row.get("department") or "Unknown")
            bucket = by_department.setdefault(
                dept,
                {"department": dept, "employee_count": 0, "gross": 0.0, "overtime_hours": 0.0},
            )
            bucket["employee_count"] += 1
            bucket["gross"] += float(row.get("grossPay") or 0)
            bucket["overtime_hours"] += float(row.get("overtimeHours") or 0)
            if row.get("anomalies"):
                exceptions.append(
                    {
                        "employee_id": row.get("employeeId"),
                        "employee_name": row.get("employeeName"),
                        "department": dept,
                        "anomalies": row.get("anomalies"),
                        "timesheet_id": row.get("id"),
                    }
                )

        upsert_payroll_run(
            pay_period_id=period_id,
            period_start=start,
            period_end=end,
            pay_date=(date.fromisoformat(end) + timedelta(days=5)).isoformat(),
            status="closed" if not is_current else "processing",
            employee_count=len(employees),
            submitted_count=submitted_count,
            missing_count=missing_count,
            total_gross=round(total_gross, 2),
            total_net=round(total_gross * 0.72, 2),
            total_overtime=round(total_ot, 2),
            by_department=by_department,
            exceptions=exceptions[:25],
        )

    print(
        f"Seeded timesheets for {len(employees)} employees across "
        f"{len(period_defs)} pay periods into {settings.cosmos_timesheets}."
    )


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
    parser.add_argument(
        "--payroll-only",
        action="store_true",
        help="Only seed timesheets and payroll runs for existing employees.",
    )
    args = parser.parse_args()
    if args.bands_only:
        seed_bands_only()
        return
    if args.tickets_only:
        seed_tickets_only()
        return
    if args.payroll_only:
        seed_payroll_only()
        return
    seed_cosmos(args.employees)
    if not args.skip_blob:
        seed_blobs()


if __name__ == "__main__":
    main()
