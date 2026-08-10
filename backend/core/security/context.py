from dataclasses import dataclass
from enum import Enum


class Role(str, Enum):
    EMPLOYEE = "employee"
    MANAGER = "manager"
    HR = "hr"
    ADMIN = "admin"


@dataclass(frozen=True)
class SecurityContext:
    user_id: str
    employee_id: str
    department: str
    role: Role
