"""Unit tests for bulk email personalization and campaign drafting."""

from __future__ import annotations

import sys
from unittest.mock import patch

# Allow `from services.bulk_email import ...` when run as a script.
sys.path.insert(0, ".")

from services import bulk_email as be


def test_personalize_tokens():
    emp = {
        "first_name": "Ada",
        "name": "Ada Lovelace",
        "email": "ada@example.com",
        "department": "Engineering",
        "role": "Developer",
        "employeeId": "emp-0042",
    }
    template = "Hi {{first_name}}, welcome to {{department}} — {{email}}"
    out = be.personalize(template, emp)
    assert "Hi Ada," in out
    assert "Engineering" in out
    assert "ada@example.com" in out


def test_resolve_recipients_dedupes_emails():
    rows = [
        {"name": "A", "email": "a@co.com", "department": "Eng", "status": "active"},
        {"name": "A dup", "email": "a@co.com", "department": "Eng", "status": "active"},
        {"name": "B", "email": "b@co.com", "department": "Eng", "status": "active"},
        {"name": "No email", "department": "Eng", "status": "active"},
    ]
    with patch.object(be, "list_employees", return_value=rows):
        got = be.resolve_recipients(department="Eng")
    assert len(got) == 2
    emails = {be._employee_email(e) for e in got}
    assert emails == {"a@co.com", "b@co.com"}


def test_draft_bulk_campaign_stashes_and_previews():
    rows = [
        {"name": "Sam Smith", "email": "sam@co.com", "department": "HR", "status": "active"},
        {"name": "Pat Lee", "email": "pat@co.com", "department": "HR", "status": "active"},
    ]
    with patch.object(be, "list_employees", return_value=rows):
        campaign = be.draft_bulk_campaign(
            subject="Team update",
            body_template="Hello {{first_name}},",
            department="HR",
            user_id="user-1",
        )
    assert campaign["ok"] is True
    assert campaign["recipient_count"] == 2
    assert campaign["recipients_preview"][0]["body"].startswith("Hello Sam")
    stashed = be.get_stashed_bulk_campaign("user-1")
    assert stashed and stashed["campaign_id"] == campaign["campaign_id"]


def test_send_bulk_campaign_mock_gmail():
    be.clear_bulk_campaign("user-1")
    be.clear_bulk_campaign("u1")
    campaign = {
        "ok": True,
        "campaign_id": "bulk-test",
        "subject": "Hi",
        "body_template": "Hello {{first_name}}",
        "messages": [
            {"email": "x@co.com", "name": "X Y", "body": "Hello X", "department": "", "role": ""},
        ],
    }
    be.stash_bulk_campaign("u1", campaign)

    def fake_send(**kwargs):
        return {"id": "msg-1", "to": kwargs["to"]}

    with patch.object(be, "gmail_send", side_effect=fake_send):
        result = be.send_bulk_campaign(campaign, "u1")
    assert result["ok"] is True
    assert result["sent_count"] == 1
    assert "u1" not in be._CAMPAIGNS


if __name__ == "__main__":
    test_personalize_tokens()
    test_resolve_recipients_dedupes_emails()
    test_draft_bulk_campaign_stashes_and_previews()
    test_send_bulk_campaign_mock_gmail()
    print("All bulk_email tests passed.")
