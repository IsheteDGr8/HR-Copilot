from core.agent.registry import agent_tool
from core.security.context import SecurityContext, Role
from core.security.rbac import can_view_employee
from services.db import db_service


@agent_tool
async def lookup_employee(name: str) -> dict:
    """Look up an employee's profile by name. Returns profile details."""
    return await db_service.lookup_employee(name)


@agent_tool
async def get_employee_profile(employee_id: str, context: SecurityContext) -> dict:
    """Look up an employee's profile by their employee ID."""
    profile = await db_service.get_user_profile(employee_id)

    if not profile:
        return {"error": "Employee not found."}

    target_department = profile.get("department", "")

    if not can_view_employee(context, employee_id, target_department):
        return {"error": "You are not authorized to view this employee's profile."}

    return profile


@agent_tool
async def find_employee_by_name(name: str, context: SecurityContext) -> dict:
    """Search for an employee by full or partial name."""
    result = await db_service.lookup_employee_by_name(name)

    if not result:
        return {"error": "No employee found matching that name."}

    target_department = result.get("department", "")

    if not can_view_employee(context, result.get("employeeId", ""), target_department):
        return {"error": "You are not authorized to view this employee's profile."}

    return result


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
