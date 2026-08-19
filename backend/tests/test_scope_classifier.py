"""Tests for HR scope classifier guardrails."""

from __future__ import annotations

from core.security.scope_classifier import ScopeAction, classify_scope
from core.security.scope_context import clear_pending


def _reset():
    clear_pending("test-user", "chat-1")


def test_blocks_general_knowledge_bts():
    _reset()
    decision = classify_scope("Who is BTS?", user_id="test-user", chat_run_id="chat-1")
    assert decision.action == ScopeAction.BLOCK


def test_blocks_coding_request():
    _reset()
    decision = classify_scope("Write code for a todo app", user_id="test-user", chat_run_id="chat-1")
    assert decision.action == ScopeAction.BLOCK


def test_clarifies_ambiguous_person():
    _reset()
    decision = classify_scope("Who is Rajnikanth?", user_id="test-user", chat_run_id="chat-1")
    assert decision.action == ScopeAction.CLARIFY
    assert decision.entity == "Rajnikanth"


def test_employee_confirmation_triggers_lookup():
    _reset()
    classify_scope("Who is Rajnikanth?", user_id="test-user", chat_run_id="chat-1")
    decision = classify_scope("Employee", user_id="test-user", chat_run_id="chat-1")
    assert decision.action == ScopeAction.EMPLOYEE_LOOKUP
    assert decision.entity == "Rajnikanth"


def test_public_figure_confirmation_blocks():
    _reset()
    classify_scope("Who is Rajnikanth?", user_id="test-user", chat_run_id="chat-1")
    decision = classify_scope("The actor", user_id="test-user", chat_run_id="chat-1")
    assert decision.action == ScopeAction.BLOCK


def test_allows_hr_policy_question():
    _reset()
    decision = classify_scope("What is our PTO policy?", user_id="test-user", chat_run_id="chat-1")
    assert decision.action == ScopeAction.ALLOW
    assert decision.hr_allowed is True


def test_allows_explicit_employee_lookup():
    _reset()
    decision = classify_scope(
        "Look up Rajnikanth's start date",
        user_id="test-user",
        chat_run_id="chat-1",
    )
    assert decision.action == ScopeAction.ALLOW
    assert decision.employee_lookup is True


def test_allows_employee_in_department():
    _reset()
    decision = classify_scope(
        "Who is Rajnikanth in engineering?",
        user_id="test-user",
        chat_run_id="chat-1",
    )
    assert decision.action == ScopeAction.ALLOW
    assert decision.employee_lookup is True


def test_blocks_unknown_off_topic():
    _reset()
    decision = classify_scope(
        "Explain quantum entanglement",
        user_id="test-user",
        chat_run_id="chat-1",
    )
    assert decision.action == ScopeAction.BLOCK


def test_employee_lookup_gate_blocks_without_scope():
    from core.security.scope_context import apply_scope_flags, reset_scope_flags
    from core.security.tool_gates import check_employee_lookup_gate

    reset_scope_flags()
    blocked = check_employee_lookup_gate()
    assert blocked is not None
    assert blocked.get("scope_blocked") is True

    apply_scope_flags(employee_lookup=True)
    assert check_employee_lookup_gate() is None


if __name__ == "__main__":
    tests = [
        test_blocks_general_knowledge_bts,
        test_blocks_coding_request,
        test_clarifies_ambiguous_person,
        test_employee_confirmation_triggers_lookup,
        test_public_figure_confirmation_blocks,
        test_allows_hr_policy_question,
        test_allows_explicit_employee_lookup,
        test_allows_employee_in_department,
        test_blocks_unknown_off_topic,
        test_employee_lookup_gate_blocks_without_scope,
    ]
    failed = 0
    for fn in tests:
        try:
            fn()
            print("OK", fn.__name__)
        except Exception as exc:
            failed += 1
            print("FAIL", fn.__name__, exc)
    raise SystemExit(1 if failed else 0)
