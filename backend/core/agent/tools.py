from core.agent.registry import agent_tool
from services.db import db_service

@agent_tool
async def lookup_employee(name: str) -> dict:
    """Look up an employee's profile by name. Returns profile details."""
    return await db_service.lookup_employee(name)

@agent_tool
async def get_pto_balance(employee_id: str) -> dict:
    """Get the PTO balance for a specific employee by ID."""
    return await db_service.get_pto_balance(employee_id)

@agent_tool
async def get_org_chart(employee_id: str) -> dict:
    """Get the manager and department for an employee."""
    return await db_service.get_org_chart(employee_id)

@agent_tool
async def draft_email(to_email: str, subject: str, context: str) -> dict:
    """Draft an email to an employee. Use this when the user asks to send a message or email."""
    return {
        "to": to_email,
        "subject": subject,
        "body": context,
        "status": "draft_created"
    }
