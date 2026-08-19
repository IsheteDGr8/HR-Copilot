"""HR scope classifier — block off-topic queries and disambiguate person names."""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional

from core.security.guardrails import guardrails
from core.security.scope_context import PendingClarification, clear_pending, get_pending, set_pending

try:
    from core.security.guardrails import nlp  # re-export spaCy model if loaded
except ImportError:
    nlp = None

OFF_SCOPE_MESSAGE = (
    "I'm HR Copilot. I can help with employee records, HR policies, intake tickets, "
    "onboarding, recruiting, payroll-related workflows, and connected HR systems — "
    "not general knowledge, celebrities, or public figures."
)

BLOCKED_KEYWORDS = (
    "write code",
    "calculate",
    "math problem",
    "recipe for",
    "who won the",
    "world cup",
    "quantum physics",
    "explain relativity",
)

KNOWN_OFF_SCOPE_ENTITIES = (
    "bts",
    "beatles",
    "taylor swift",
    "elon musk",
    "barack obama",
)

CELEBRITY_MARKERS = (
    "actor",
    "actress",
    "celebrity",
    "public figure",
    "singer",
    "band",
    "movie star",
    "politician",
    "the movie",
    "film star",
    "k-pop",
    "kpop",
)

HR_SCOPE_KEYWORDS = (
    "employee",
    "workday",
    "payroll",
    "pto",
    "onboarding",
    "onboard",
    "ticket",
    "intake",
    "benefits",
    "benefit",
    "policy",
    "policies",
    "salary",
    "leave",
    "fmla",
    "recruiting",
    "hiring",
    "applicant",
    "candidate",
    "offer letter",
    "job posting",
    "helpdesk",
    "hr ",
    "human resources",
    "org chart",
    "transfer",
    "promotion",
    "provision",
    "laptop",
    "timesheet",
    "attendance",
    "verification letter",
    "employment verification",
    "connected system",
    "work queue",
    "cosmos",
    "attached_document",
)

EXPLICIT_EMPLOYEE_LOOKUP = (
    "look up",
    "lookup",
    "look up employee",
    "employee record",
    "employee id",
    "employee profile",
    "start date for",
    "start date of",
    "salary for",
    "salary of",
    "compensation for",
    "manager for",
    "department for",
    "our employee",
    "in workday",
    "in the company",
    "on payroll",
    "in payroll",
    "internal employee",
    "employee named",
    "find employee",
    "search employee",
    "who works",
    "does work here",
    "works in",
    "works at",
)

EMPLOYEE_CONFIRM = (
    "employee",
    "our employee",
    "company employee",
    "internal",
    "in the company",
    "in our systems",
    "in workday",
    "check the database",
    "check internally",
    "yes employee",
    "yes, employee",
    "yes — employee",
    "yes - employee",
)

PUBLIC_FIGURE_CONFIRM = (
    "actor",
    "actress",
    "celebrity",
    "public figure",
    "not employee",
    "not hr-related",
    "not hr related",
    "no employee",
    "not an employee",
    "not hr",
    "just curious",
    "the singer",
    "the band",
    "movie",
)

WHO_IS_IN_DEPT_RE = re.compile(r"who\s+is\s+.+\s+in\s+\w", re.IGNORECASE)
WHO_IS_RE = re.compile(
    r"^\s*who\s+is\s+(?:the\s+)?(?P<name>.+?)\s*\??\s*$",
    re.IGNORECASE,
)
WHO_ARE_RE = re.compile(
    r"^\s*who\s+are\s+(?:the\s+)?(?P<name>.+?)\s*\??\s*$",
    re.IGNORECASE,
)
TELL_ME_ABOUT_RE = re.compile(
    r"^\s*tell\s+me\s+about\s+(?P<name>.+?)\s*\??\s*$",
    re.IGNORECASE,
)
EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
EMP_ID_RE = re.compile(r"\bemp-\d+\b", re.IGNORECASE)


class ScopeAction(str, Enum):
    ALLOW = "allow"
    BLOCK = "block"
    CLARIFY = "clarify"
    EMPLOYEE_LOOKUP = "employee_lookup"


@dataclass
class ScopeDecision:
    action: ScopeAction
    message: Optional[str] = None
    entity: Optional[str] = None
    employee_lookup: bool = False
    hr_allowed: bool = False
    reason: str = ""


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def _strip_attached_doc(text: str) -> str:
    return re.sub(r"<Attached_Document>.*", "", text, flags=re.DOTALL | re.IGNORECASE).strip()


def _has_hr_context(text: str) -> bool:
    lower = text.lower()
    return any(k in lower for k in HR_SCOPE_KEYWORDS)


def _has_explicit_employee_lookup(text: str) -> bool:
    lower = text.lower()
    if EMAIL_RE.search(text) or EMP_ID_RE.search(text):
        return True
    if WHO_IS_IN_DEPT_RE.search(text):
        return True
    return any(k in lower for k in EXPLICIT_EMPLOYEE_LOOKUP)


def _is_off_scope_general(text: str) -> bool:
    lower = text.lower()
    if any(k in lower for k in BLOCKED_KEYWORDS):
        return True
    if any(k in lower for k in CELEBRITY_MARKERS):
        return True
    if any(entity in lower for entity in KNOWN_OFF_SCOPE_ENTITIES):
        return True
    if TELL_ME_ABOUT_RE.match(text) and not _has_hr_context(text):
        return True
    return False


def _extract_person_name(text: str) -> Optional[str]:
    cleaned = _normalize(_strip_attached_doc(text))
    for pattern in (WHO_IS_RE, WHO_ARE_RE):
        m = pattern.match(cleaned)
        if m:
            name = m.group("name").strip(" ?.")
            if name and len(name.split()) <= 6:
                return name
    m = TELL_ME_ABOUT_RE.match(cleaned)
    if m:
        name = m.group("name").strip(" ?.")
        if name and len(name.split()) <= 6 and not _has_hr_context(cleaned):
            return name
    if nlp is not None:
        doc = nlp(cleaned[:500])
        for ent in doc.ents:
            if ent.label_ == "PERSON" and len(ent.text.split()) <= 4:
                return ent.text.strip()
    return None


def _is_ambiguous_person_query(text: str) -> Optional[str]:
    cleaned = _normalize(_strip_attached_doc(text))
    if _has_hr_context(cleaned) or _has_explicit_employee_lookup(cleaned):
        return None
    if EMAIL_RE.search(cleaned) or EMP_ID_RE.search(cleaned):
        return None
    lower = cleaned.lower()
    if any(k in lower for k in CELEBRITY_MARKERS):
        return None
    name = _extract_person_name(cleaned)
    if not name:
        return None
    # Short "Who is X?" with no HR keywords → clarify
    if WHO_IS_RE.match(cleaned) or WHO_ARE_RE.match(cleaned):
        return name
    return None


def _clarify_message(entity: str) -> str:
    return (
        f"Are you asking about **{entity}** as a public figure, or checking whether "
        f"someone named **{entity}** is an employee in our systems?\n\n"
        f"Reply **Employee** to search our records, or **Not HR-related** if this isn't an HR question."
    )


def _handle_pending_reply(
    prompt: str,
    pending: PendingClarification,
    user_id: str,
    chat_run_id: str,
) -> ScopeDecision:
    lower = _normalize(prompt).lower()
    if any(k in lower for k in PUBLIC_FIGURE_CONFIRM):
        clear_pending(user_id, chat_run_id)
        return ScopeDecision(action=ScopeAction.BLOCK, message=OFF_SCOPE_MESSAGE, reason="public_figure_confirmed")
    if any(k in lower for k in EMPLOYEE_CONFIRM) or lower in ("employee", "yes", "yes."):
        clear_pending(user_id, chat_run_id)
        return ScopeDecision(
            action=ScopeAction.EMPLOYEE_LOOKUP,
            entity=pending.entity,
            employee_lookup=True,
            hr_allowed=True,
            reason="employee_confirmed",
        )
    # Still ambiguous — re-ask
    return ScopeDecision(
        action=ScopeAction.CLARIFY,
        message=_clarify_message(pending.entity),
        entity=pending.entity,
        reason="clarification_repeat",
    )


def classify_scope(
    prompt: str,
    *,
    history: Optional[List[Dict[str, Any]]] = None,
    user_id: str = "",
    chat_run_id: str = "",
) -> ScopeDecision:
    """Classify a user turn. Default deny when uncertain."""
    del history  # reserved for future multi-turn rules
    text = _normalize(_strip_attached_doc(prompt))
    if not text:
        return ScopeDecision(action=ScopeAction.ALLOW, hr_allowed=True, reason="empty")

    pending = get_pending(user_id, chat_run_id)
    if pending:
        return _handle_pending_reply(text, pending, user_id, chat_run_id)

    # Legacy keyword guard (coding, math, etc.)
    try:
        guardrails.validate_prompt(text)
    except Exception:
        return ScopeDecision(action=ScopeAction.BLOCK, message=OFF_SCOPE_MESSAGE, reason="legacy_blocked")

    if _is_off_scope_general(text) and not _has_hr_context(text):
        return ScopeDecision(action=ScopeAction.BLOCK, message=OFF_SCOPE_MESSAGE, reason="off_scope_general")

    ambiguous_name = _is_ambiguous_person_query(text)
    if ambiguous_name:
        set_pending(user_id, chat_run_id, ambiguous_name)
        return ScopeDecision(
            action=ScopeAction.CLARIFY,
            message=_clarify_message(ambiguous_name),
            entity=ambiguous_name,
            reason="ambiguous_person",
        )

    explicit_lookup = _has_explicit_employee_lookup(text)
    if explicit_lookup:
        entity = _extract_person_name(text)
        return ScopeDecision(
            action=ScopeAction.ALLOW,
            entity=entity,
            employee_lookup=True,
            hr_allowed=True,
            reason="explicit_employee_lookup",
        )

    if _has_hr_context(text):
        return ScopeDecision(
            action=ScopeAction.ALLOW,
            employee_lookup=explicit_lookup,
            hr_allowed=True,
            reason="hr_context",
        )

    # Greetings and very short HR-adjacent chat
    if len(text.split()) <= 4 and text.lower() in {
        "hi",
        "hello",
        "hey",
        "thanks",
        "thank you",
        "good morning",
        "good afternoon",
    }:
        return ScopeDecision(action=ScopeAction.ALLOW, hr_allowed=True, reason="greeting")

    # Default deny — do not answer unknown off-scope questions
    return ScopeDecision(action=ScopeAction.BLOCK, message=OFF_SCOPE_MESSAGE, reason="default_deny")
