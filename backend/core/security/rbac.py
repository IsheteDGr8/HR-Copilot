from fastapi import HTTPException, status

from core.security.context import Role, SecurityContext


def require_roles(context: SecurityContext, allowed_roles: set[Role]) -> None:
    if context.role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to perform this operation.",
        )


def can_view_employee(context: SecurityContext, target_employee_id: str, target_department: str) -> bool:
    # Admins and HR can see everyone
    if context.role in (Role.ADMIN, Role.HR):
        return True

    # Employees and managers can only see people in their own department
    if context.department == target_department:
        return True

    # Employees can always see their own record regardless of department
    if context.employee_id == target_employee_id:
        return True

    return False
