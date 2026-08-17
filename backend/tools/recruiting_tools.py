"""Recruiting tooling: posting stash + resume screening matrix.

Postings are drafted deterministically by the Recruiting worker and published
by the Execution agent only after [POSTING APPROVED]. Resumes are parsed against
a requisition to produce a candidate matrix for the Side Canvas.
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
    return re.findall(r"[a-zA-Z][a-zA-Z0-9+.#-]{1,}", (text or "").lower())


def score_resume(resume_text: str, required_skills: List[str]) -> dict:
    """Match a resume against required skills; returns matched list + count."""
    tokens = set(_tokenize(resume_text))
    matched: List[str] = []
    for skill in required_skills:
        s = skill.strip().lower()
        if not s:
            continue
        # multi-word skills: require all words present
        parts = _tokenize(s)
        if parts and all(p in tokens for p in parts):
            matched.append(skill)
    return {"matched_skills": matched, "match_count": len(matched)}


def parse_resume_against_requisition(
    requisition_id: str,
    required_skills: List[str],
    candidates: Optional[List[dict]] = None,
    job_role: str = "",
) -> dict:
    """Build a candidate matrix ranked by skill match for the Side Canvas.

    `candidates` is a list of {id?, name, resume_text}. Kept dependency-free so it
    can be driven by resumes fetched from Blob or pasted inline.
    """
    skills = [s for s in (required_skills or []) if str(s).strip()]
    recs: List[dict] = []
    for idx, cand in enumerate(candidates or []):
        text = str(cand.get("resume_text") or "")
        scored = score_resume(text, skills)
        recs.append(
            {
                "id": cand.get("id") or f"cand-{idx + 1}",
                "name": cand.get("name") or f"Candidate {idx + 1}",
                "summary": cand.get("summary") or "",
                "matched_skills": scored["matched_skills"],
                "match_count": scored["match_count"],
            }
        )
    recs.sort(key=lambda r: r["match_count"], reverse=True)
    return {
        "ok": True,
        "requisition_id": requisition_id,
        "job_role": job_role,
        "required_skills": skills,
        "recommendations": recs,
        "summary": (
            f"Screened {len(recs)} candidate(s) against {len(skills)} required skill(s)."
            if recs
            else "No candidates provided."
        ),
    }
