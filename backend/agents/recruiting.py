"""Recruiting worker — job postings must satisfy RCW 49.58 (range + benefits)."""

from __future__ import annotations

import json
import re
from typing import Any, AsyncGenerator, Dict, List, Optional, Union

from agents.runtime import llm_complete, sse
from tools.azure_blob import save_resume_to_blob
from tools.azure_cosmos import get_compensation_band
from tools.compliance_validator import posting_from_band, validate_salary_range_text
from tools.recruiting_tools import parse_resume_against_requisition, stash_posting

_ATTACHED_RE = re.compile(r"<Attached_Document>\s*(.*?)\s*</Attached_Document>", re.S)

SYSTEM = """You are the Recruiting worker for Washington State employers.

STRICT RULES:
1. You MUST call draft_compliant_job_posting (the compensation lookup tool) before drafting
   any external job post — this is required for RCW 49.58 compliance. Never invent a salary range.
2. Never use open-ended pay language like "$50,000 and up".
3. Once the tool returns data, the backend emits the posting dictionary to the Side Canvas via
   canvas_update. Do NOT continue writing a long chat reply — keep chat text minimal.
4. You do not publish to LinkedIn yourself — Execution does that only after [POSTING APPROVED].

Map common titles to Cosmos compensation_bands job_family values:
  - Software Engineer / SDE / SDE 1 / SWE / Software Development Engineer → job_family="Engineering"
  - For entry-level SDE 1 roles, pass level="SDE 1"
  - HR roles → job_family="People"; finance → "Finance"; sales → "Sales"

When the user lists skills, must-haves, or timeline, pass them into the tool
(required_skills, must_haves, interview_plan / hire_timeline).
"""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "draft_compliant_job_posting",
            "description": (
                "Look up compensation_bands and draft a RCW 49.58-compliant job posting. "
                "Must be called before any external JD is shown to the user."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "job_family": {"type": "string"},
                    "level": {"type": "string"},
                    "title": {"type": "string"},
                    "location": {"type": "string"},
                    "required_skills": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Top required skills/qualifications from the hiring manager.",
                    },
                    "must_haves": {
                        "type": "string",
                        "description": "Work authorization, years of experience, tools, etc.",
                    },
                    "hire_timeline": {
                        "type": "string",
                        "description": "Target start / hire-by date.",
                    },
                    "interview_plan": {
                        "type": "string",
                        "description": "Interview stages if provided; otherwise leave blank for default.",
                    },
                },
                "required": ["job_family", "title"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "screen_resume",
            "description": (
                "Screen an attached resume against a requisition's required skills and build a "
                "candidate matrix. Use when the user uploads/pastes a resume to evaluate."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "requisition_id": {"type": "string"},
                    "job_role": {"type": "string"},
                    "candidate_name": {"type": "string"},
                    "required_skills": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["required_skills"],
            },
        },
    },
]


def _extracted_resume_text(prompt: str) -> str:
    m = _ATTACHED_RE.search(prompt or "")
    return m.group(1).strip() if m else ""


def _as_skill_list(raw: Union[str, List[str], None]) -> List[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(s).strip() for s in raw if str(s).strip()]
    text = str(raw).strip()
    if not text:
        return []
    parts = re.split(r"[,;\n|/]+", text)
    return [p.strip() for p in parts if p.strip()]


def _default_interview_plan(hire_timeline: str = "") -> str:
    timeline = (hire_timeline or "within ~4 weeks").strip()
    return (
        "Suggested interview loop (target hire "
        f"{timeline}):\n"
        "  1. Recruiter screen (30 min) — day 1–3\n"
        "  2. Technical screen / coding (60 min) — day 4–8\n"
        "  3. System / project deep-dive (60 min) — day 8–12\n"
        "  4. Hiring manager + values (45 min) — day 12–16\n"
        "  5. Offer decision — by end of week 3–4"
    )


def _render_posting_body(
    *,
    title: str,
    location: str,
    salary_range: str,
    benefits_summary: str,
    skills: List[str],
    must_haves: str,
    interview_plan: str,
    level: str,
    job_family: str,
) -> str:
    skills_block = (
        "\n".join(f"  • {s}" for s in skills)
        if skills
        else "  • Relevant experience for the role"
    )
    must = must_haves.strip() or "Authorization to work in the United States."
    plan = interview_plan.strip() or _default_interview_plan()
    level_line = f"Level: {level}\n" if level else ""
    family_line = f"Job family: {job_family}\n" if job_family else ""
    return (
        f"{title}\n"
        f"{level_line}{family_line}"
        f"Location: {location}\n\n"
        f"Salary range (RCW 49.58): {salary_range}\n"
        f"Benefits: {benefits_summary}\n\n"
        "About the role\n"
        f"We are hiring a {title} to join the team. This posting includes a closed "
        "pay range and benefits summary as required under Washington RCW 49.58.\n\n"
        "Required skills & qualifications\n"
        f"{skills_block}\n\n"
        "Must-haves\n"
        f"  • {must}\n\n"
        "Interview & hiring timeline\n"
        f"{plan}\n"
    )


def draft_compliant_job_posting(
    job_family: str,
    title: str,
    level: str = "",
    location: str = "Washington",
    required_skills: Optional[Union[str, List[str]]] = None,
    must_haves: str = "",
    hire_timeline: str = "",
    interview_plan: str = "",
) -> dict:
    try:
        band = get_compensation_band(job_family, level or None)
    except Exception as exc:
        return {
            "ok": False,
            "error": (
                "Compensation band not found for this role. "
                f"Please specify an existing job family. ({exc})"
            ),
        }
    posting = posting_from_band(band)
    if not posting.get("ok"):
        err = posting.get("error") or "Compensation band not found for this role."
        return {
            "ok": False,
            "error": (
                f"{err} Please specify an existing job family "
                "(e.g. Engineering, People, Finance, Sales)."
            ),
        }
    check = validate_salary_range_text(posting["salary_range"])
    if not check.get("ok"):
        return {"ok": False, "error": check.get("error") or json.dumps(check)}

    skills = _as_skill_list(required_skills)
    plan = (interview_plan or "").strip() or _default_interview_plan(hire_timeline)
    body = _render_posting_body(
        title=title,
        location=location or "Washington",
        salary_range=posting["salary_range"],
        benefits_summary=posting["benefits_summary"],
        skills=skills,
        must_haves=must_haves or "",
        interview_plan=plan,
        level=level or str(posting.get("level") or ""),
        job_family=str(posting.get("job_family") or job_family),
    )
    return {
        "ok": True,
        "title": title,
        "job_family": posting.get("job_family") or job_family,
        "level": level or posting.get("level") or "",
        "location": location or "Washington",
        "salary_range": posting["salary_range"],
        "salary_min": posting["salary_min"],
        "salary_max": posting["salary_max"],
        "benefits_summary": posting["benefits_summary"],
        "required_skills": skills,
        "must_haves": must_haves,
        "hire_timeline": hire_timeline,
        "interview_plan": plan,
        "body": body,
        "letter_markdown": body,
        "status": "awaiting_approval",
        "message": (
            "Compliant job posting drafted for Side Canvas. "
            "Do not invent a different salary range. Wait for [POSTING APPROVED] to publish."
        ),
    }


async def run(
    prompt: str,
    history: Optional[List[Dict[str, Any]]] = None,
    user_id: str = "",
) -> AsyncGenerator[str, None]:
    messages: List[Dict[str, Any]] = [
        {"role": "system", "content": SYSTEM},
        *(history or []),
        {"role": "user", "content": prompt},
    ]
    response = await llm_complete(messages, tools=TOOLS, stream=False)
    msg = response.choices[0].message
    tool_calls = getattr(msg, "tool_calls", None) or []
    if not tool_calls:
        yield sse(
            "delta",
            data=(
                getattr(msg, "content", None)
                or "Which job family should I look up in compensation_bands "
                "(Engineering, People, Finance, Sales)?"
            ),
        )
        return

    for tc in tool_calls:
        name = tc.function.name
        args = json.loads(tc.function.arguments or "{}")
        yield sse("tool_start", tool=name, args=args)

        if name == "screen_resume":
            req_id = str(args.get("requisition_id") or "unassigned")
            candidate = str(args.get("candidate_name") or "Candidate")
            skills = args.get("required_skills") or []
            resume_text = _extracted_resume_text(prompt)
            if not resume_text:
                yield sse("tool_end", tool=name, error="No resume text found in the attachment.")
                yield sse(
                    "delta",
                    data="Attach or paste a resume so I can screen it against the requisition.",
                )
                return
            try:
                save_resume_to_blob(resume_text.encode("utf-8"), f"{candidate}.txt", req_id)
            except Exception:
                pass
            matrix = parse_resume_against_requisition(
                requisition_id=req_id,
                required_skills=skills,
                candidates=[{"name": candidate, "resume_text": resume_text}],
                job_role=str(args.get("job_role") or ""),
            )
            yield sse("tool_end", tool=name, result={"ok": True})
            yield sse("canvas_update", data={"view": "RESUME_SCREENING", "data": matrix})
            yield sse("delta", data=matrix.get("summary") or "Candidate matrix ready in the Side Canvas.")
            return

        keys = (
            "job_family",
            "title",
            "level",
            "location",
            "required_skills",
            "must_haves",
            "hire_timeline",
            "interview_plan",
        )
        allowed = {k: args[k] for k in keys if k in args}
        try:
            result = draft_compliant_job_posting(**allowed)
        except Exception as exc:
            yield sse("tool_end", tool=name, error=str(exc))
            yield sse(
                "delta",
                data=(
                    "Compensation band not found for this role. "
                    "Please specify an existing job family "
                    f"(Engineering, People, Finance, Sales). ({exc})"
                ),
            )
            return

        yield sse("tool_end", tool=name, result={"ok": result.get("ok")})
        if result.get("ok"):
            stash_posting(user_id, result)
            # Emit posting to Side Canvas, then stop — no long chat draft.
            yield sse("canvas_update", data={"view": "RECRUITING_POSTING", "data": result})
            yield sse(
                "delta",
                data=(
                    "Compliant job posting drafted in the Side Canvas "
                    "(salary range + benefits per RCW 49.58). "
                    "Review it, then Confirm & Publish (or reply [POSTING APPROVED])."
                ),
            )
        else:
            yield sse(
                "delta",
                data=result.get("error")
                or "Compensation band not found for this role. Please specify an existing job family.",
            )
        return
