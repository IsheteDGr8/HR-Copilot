"""Dev-only helper: simulate IT closing a provisioning ticket.

Posts to POST /api/v1/webhooks/it-ticket-ack so the onboarding checklist flips
profile_setup + email_setup to true — the mock end of the IT round-trip.

Usage:
    python scripts/mock_it_ack.py <employee_id> [--ticket IT-...] [--status complete]

Requires WEBHOOK_SHARED_SECRET in the environment (same value the API uses).
"""

from __future__ import annotations

import argparse
import os
import sys

import httpx
from dotenv import load_dotenv

load_dotenv(override=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Simulate an IT ticket acknowledgement")
    parser.add_argument("employee_id")
    parser.add_argument("--ticket", default=None)
    parser.add_argument("--status", default="complete")
    parser.add_argument("--base-url", default=os.getenv("BACKEND_URL", "http://localhost:8000"))
    args = parser.parse_args()

    secret = (os.getenv("WEBHOOK_SHARED_SECRET") or "").strip()
    if not secret:
        print("WEBHOOK_SHARED_SECRET is not set; the API will reject the call.", file=sys.stderr)
        return 2

    resp = httpx.post(
        f"{args.base_url}/api/v1/webhooks/it-ticket-ack",
        headers={"X-Webhook-Token": secret},
        json={"employee_id": args.employee_id, "ticket_id": args.ticket, "status": args.status},
        timeout=30.0,
    )
    print(resp.status_code, resp.text)
    return 0 if resp.status_code < 400 else 1


if __name__ == "__main__":
    raise SystemExit(main())
