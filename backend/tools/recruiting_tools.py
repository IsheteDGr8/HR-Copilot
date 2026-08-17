"""Recruiting tooling: posting stash + resume screening matrix + ATS write.

Postings are drafted deterministically by the Recruiting worker and published
by the Execution agent only after [POSTING APPROVED]. Resumes are parsed against
a requisition to produce a candidate matrix and persisted to the applicants container.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_POSTINGS: Dict[str, dict] = {}


def stash_posting(user_id: str, posting: dict) -> None:
    key = (user_id or "").strip()
    if key:
        _POSTINGS[key] = posting


def get_stashed_posting(user_id: str) -> Optional[dict]:
    uid = (user_id or "").strip()
    if uid and uid in _POSTINGS:
        return _POSTINGS[uid]
    if _POSTINGS:
        return next(reversed(list(_POSTINGS.values())))
    return None


def _tokenize(text: str) -> List[str]:
    # Split on word chars; strip trailing punctuation so "React." → "react".
    raw = re.findall(r"[a-zA-Z][a-zA-Z0-9+#-]*", (text or "").lower())
    return [t.rstrip(".") for t in raw if t.rstrip(".")]


def score_resume(resume_text: str, required_skills: List[str]) -> dict:
    """Match a resume against required skills; returns matched, gaps, and 1–100 score."""
    # Build token set but drop skills that appear only in a negation window ("no Go").
    lowered = (resume_text or "").lower()
    tokens = set(_tokenize(resume_text))
    negated: set[str] = set()
    for m in re.finditer(r"\b(?:no|not|without|lack(?:ing)?|never)\s+([a-zA-Z][a-zA-Z0-9+#-]*)", lowered):
        negated.add(m.group(1).rstrip("."))

    matched: List[str] = []
    gaps: List[str] = []
    for skill in required_skills:
        s = skill.strip()
        if not s:
            continue
        parts = _tokenize(s.lower())
        if not parts:
            continue
        if any(p in negated for p in parts):
            gaps.append(skill)
            continue
        if all(p in tokens for p in parts):
            matched.append(skill)
        else:
            gaps.append(skill)
    total = len(matched) + len(gaps)
    match_score = int(round((len(matched) / total) * 100)) if total else 0
    match_score = max(1, match_score) if matched else match_score
    return {
        "matched_skills": matched,
        "gaps": gaps,
        "match_count": len(matched),
        "match_score": match_score,
    }


def _ai_summary(
    *,
    name: str,
    job_role: str,
    matched: List[str],
    gaps: List[str],
    match_score: int,
) -> str:
    """Clean 2–3 sentence fit synthesis from skills/gaps only — no resume dumps."""
    role = (job_role or "the open role").strip()
    first = name.split()[0] if name.strip() else "This candidate"

    if match_score >= 80 and matched:
        s1 = (
            f"{first} is a strong match for {role} ({match_score}/100), "
            f"demonstrating {', '.join(matched[:5])}."
        )
    elif match_score >= 50 and matched:
        s1 = (
            f"{first} is a partial match for {role} ({match_score}/100), "
            f"with clear strength in {', '.join(matched[:5])}."
        )
    elif matched:
        s1 = (
            f"{first} shows limited overlap with {role} ({match_score}/100); "
            f"only {', '.join(matched[:4])} appear to be covered."
        )
    else:
        s1 = (
            f"{first} does not currently demonstrate the required skills for {role} "
            f"({match_score}/100)."
        )

    if gaps:
        s2 = f"Key gaps to probe in screening: {', '.join(gaps[:6])}."
    else:
        s2 = "No critical skill gaps were identified against the requisition."

    if match_score >= 80:
        s3 = "Recommended for shortlist pending a technical screen."
    elif match_score >= 50:
        s3 = "Worth a recruiter screen to validate depth on the matched skills."
    else:
        s3 = "Likely a weak fit unless the requisition skills are flexible."

    return f"{s1} {s2} {s3}"


def parse_resume_against_requisition(
    requisition_id: str,
    required_skills: List[str],
    candidates: Optional[List[dict]] = None,
    job_role: str = "",
    *,
    persist: bool = True,
) -> dict:
    """Build a candidate matrix ranked by skill match; optionally write ATS applicants.

    `candidates` is a list of {id?, name, resume_text, resume_blob_url?}.
    """
    from tools.azure_cosmos import list_applicants, upsert_applicant

    skills = [s for s in (required_skills or []) if str(s).strip()]
    req = (requisition_id or "unassigned").strip() or "unassigned"
    recs: List[dict] = []

    for idx, cand in enumerate(candidates or []):
        text = str(cand.get("resume_text") or "")
        scored = score_resume(text, skills)
        name = str(cand.get("name") or f"Candidate {idx + 1}")
        blob_url = str(cand.get("resume_blob_url") or cand.get("blob") or "")
        summary = _ai_summary(
            name=name,
            job_role=job_role,
            matched=scored["matched_skills"],
            gaps=scored["gaps"],
            match_score=scored["match_score"],
        )
        applicant_id = str(cand.get("id") or "").strip() or None
        saved = None
        if persist:
            try:
                saved = upsert_applicant(
                    requisition_id=req,
                    name=name,
                    resume_blob_url=blob_url,
                    ai_summary=summary,
                    skills=scored["matched_skills"],
                    gaps=scored["gaps"],
                    match_score=scored["match_score"],
                    status="Applied",
                    applicant_id=applicant_id,
                    job_role=job_role,
                )
                applicant_id = saved.get("id")
            except Exception as exc:
                logger.exception("upsert_applicant failed: %s", exc)

        recs.append(
            {
                "id": applicant_id or f"cand-{idx + 1}",
                "name": name,
                "job_role": job_role or (saved or {}).get("job_role") or "",
                "summary": summary,
                "ai_summary": summary,
                "matched_skills": scored["matched_skills"],
                "skills": scored["matched_skills"],
                "gaps": scored["gaps"],
                "match_count": scored["match_count"],
                "match_score": scored["match_score"],
                "status": (saved or {}).get("status") or "Applied",
                "resume_blob_url": blob_url,
                "requisitionId": req,
            }
        )

    recs.sort(key=lambda r: (-int(r.get("match_score") or 0), str(r.get("name") or "")))

    # Prefer live Cosmos list when available so the canvas mirrors ATS state.
    cosmos_list: List[dict] = []
    if persist:
        try:
            cosmos_list = list_applicants(req)
        except Exception:
            cosmos_list = []

    return {
        "ok": True,
        "requisition_id": req,
        "job_role": job_role,
        "required_skills": skills,
        "recommendations": recs,
        "applicants": cosmos_list or recs,
        "summary": (
            f"Screened {len(recs)} candidate(s) against {len(skills)} required skill(s); "
            f"saved to applicants/{req}."
            if recs
            else "No candidates provided."
        ),
    }
