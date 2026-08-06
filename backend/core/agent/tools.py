from core.agent.registry import agent_tool
from services.db import db_service


@agent_tool
async def get_employee_profile(employee_id: str) -> dict:
    """Look up an employee's profile by their employee ID."""
    return await db_service.get_user_profile(employee_id)


@agent_tool
async def find_employee_by_name(name: str) -> dict:
    """Search for an employee by full or partial name."""
    result = await db_service.lookup_employee_by_name(name)
    return result or {"error": "No employee found matching that name."}
