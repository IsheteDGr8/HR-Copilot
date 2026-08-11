import asyncio
import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "backend", ".env"), override=True)

from services.db import db_service


async def main():
    print("Creating onboarding checklist...")
    try:
        created = await db_service.create_onboarding_checklist(
            employee_name="Alex Rivera",
            role="Software Engineer",
            department="Engineering",
        )
        print("Created:", created)
        employee_id = created.get("employee_id") or created.get("id")

        print("Updating IT provisioning...")
        updated = await db_service.update_checklist_item(
            employee_id=employee_id,
            item_key="it_provisioning",
            status="Completed",
        )
        print("Updated:", updated)

        print("Saving offer letter...")
        doc = await db_service.save_document(
            {
                "type": "offer_letter",
                "candidate_name": "Alex Rivera",
                "salary": 145000,
                "start_date": "2026-09-01",
                "status": "draft",
                "content": {"title": "Offer Letter — Alex Rivera"},
            }
        )
        print("Document:", doc)
    except Exception as e:
        print("Exception:", e)

    await db_service.close()


if __name__ == "__main__":
    asyncio.run(main())
