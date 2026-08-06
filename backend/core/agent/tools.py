import inspect
from typing import Callable, Dict, Any
from pydantic import BaseModel
from services.db import db_service
import asyncio

class ToolRegistry:
    def __init__(self):
        self.tools: Dict[str, Callable] = {}
        self.schemas: list[Dict[str, Any]] = []

    def register(self, name: str, description: str):
        def decorator(func: Callable):
            self.tools[name] = func
            sig = inspect.signature(func)
            parameters = {
                "type": "object",
                "properties": {},
                "required": []
            }
            for param_name, param in sig.parameters.items():
                param_type = "string"
                if param.annotation == int:
                    param_type = "integer"
                elif param.annotation == bool:
                    param_type = "boolean"
                parameters["properties"][param_name] = {"type": param_type}
                if param.default == inspect.Parameter.empty:
                    parameters["required"].append(param_name)

            schema = {
                "type": "function",
                "function": {
                    "name": name,
                    "description": description,
                    "parameters": parameters
                }
            }
            self.schemas.append(schema)
            return func
        return decorator

registry = ToolRegistry()

@registry.register(name="lookup_employee", description="Look up an employee's profile by name. Returns profile details.")
async def lookup_employee(name: str) -> dict:
    profile = await db_service.lookup_employee_by_name(name)
    if not profile:
        return {"error": f"Employee {name} not found."}
    return profile

@registry.register(name="get_pto_balance", description="Get the PTO balance for a specific employee by ID.")
async def get_pto_balance(employee_id: str) -> dict:
    profile = await db_service.get_user_profile(employee_id)
    if not profile:
        return {"error": f"Employee ID {employee_id} not found."}
    return {
        "pto_remaining": profile.get("pto_remaining"),
        "pto_used": profile.get("pto_used")
    }

@registry.register(name="draft_email", description="Draft an email to an employee. Use this when the user asks to send a message or email.")
async def draft_email(to_email: str, subject: str, context: str) -> dict:
    return {
        "to": to_email,
        "subject": subject,
        "body": context,
        "status": "draft_created"
    }

@registry.register(name="get_org_chart", description="Get the manager and department for an employee.")
async def get_org_chart(employee_id: str) -> dict:
    profile = await db_service.get_user_profile(employee_id)
    if not profile:
        return {"error": f"Employee ID {employee_id} not found."}
    return {
        "manager": profile.get("manager"),
        "department": profile.get("department")
    }
