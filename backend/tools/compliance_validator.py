"""Washington State compliance guardrails (hardcoded 2026 thresholds).

RCW 49.62 — non-compete enforceability by compensation.
RCW 49.58 — Equal Pay and Opportunities Act: salary range + benefits on postings.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

# RCW 49.62 (2026)
RCW_4962_W2_MIN = 126_858.83
RCW_4962_CONTRACTOR_MIN = 317_147.09

_OPEN_ENDED = re.compile(
    r"(\$[\d,]+\s*(and\s+up|or\s+more|\+|plus)\b)|(\bup\s+to\s+\$)|(\bstarting\s+at\b)|(\bcompetitive\b)",
    re.IGNORECASE,
)
_RANGE = re.compile(
    r"\$?\s*([\d,]+(?:\.\d+)?)\s*[-–to]+\s*\$?\s*([\d,]+(?:\.\d+)?)",
    re.IGNORECASE,
)


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None or value == "":
            return default
        return float(str(value).replace(",", "").replace("$", "").strip())
    except (TypeError, ValueError):
        return default


def is_contractor(employment_type: Optional[str]) -> bool:
    t = (employment_type or "W-2").strip().lower()
    return any(k in t for k in ("contractor", "1099", "independent", "c2c"))


def noncompete_allowed(annual_salary: Any, employment_type: Optional[str] = "W-2") -> Tuple[bool, str]:
    salary = _as_float(annual_salary, 0.0)
    if is_contractor(employment_type):
        ok = salary >= RCW_4962_CONTRACTOR_MIN
        threshold = RCW_4962_CONTRACTOR_MIN
        kind = "independent contractor"
    else:
        ok = salary >= RCW_4962_W2_MIN
        threshold = RCW_4962_W2_MIN
        kind = "W-2 employee"
    if ok:
        return True, (
            f"RCW 49.62: {kind} compensation ${salary:,.2f} meets the 2026 "
            f"threshold (${threshold:,.2f}). Non-compete/NDA may be included."
        )
    return False, (
        f"RCW 49.62: {kind} compensation ${salary:,.2f} is below the 2026 "
        f"threshold (${threshold:,.2f}). Non-compete/NDA MUST be removed from the packet."
    )


def filter_document_links(links_markdown: str, annual_salary: Any, employment_type: Optional[str] = "W-2") -> Dict[str, Any]:
    """Drop NDA/non-compete lines when salary is below RCW 49.62."""
    allowed, reason = noncompete_allowed(annual_salary, employment_type)
    lines = [ln for ln in (links_markdown or "").splitlines() if ln.strip()]
    removed: List[str] = []
    kept: List[str] = []
    for line in lines:
        lower = line.lower()
        is_nc = any(tok in lower for tok in ("nda", "non-compete", "noncompete", "non_compete"))
        if is_nc and not allowed:
            removed.append(line)
            continue
        kept.append(line)
    return {
        "include_noncompete": allowed,
        "reason": reason,
        "document_links": "\n".join(kept) if kept else links_markdown,
        "removed": removed,
    }


def validate_salary_range_text(range_text: str) -> Dict[str, Any]:
    """RCW 49.58: posting must have a closed min–max range, not '$X and up'."""
    text = (range_text or "").strip()
    if not text:
        return {"ok": False, "error": "RCW 49.58: salary range is required on the job posting."}
    if _OPEN_ENDED.search(text) or re.search(r"\band\s+up\b", text, re.I):
        return {
            "ok": False,
            "error": (
                "RCW 49.58: open-ended pay language is not allowed "
                f"(got {text!r}). Use a hard minimum and maximum, e.g. '$120,000 – $150,000'."
            ),
        }
    match = _RANGE.search(text)
    if not match:
        return {
            "ok": False,
            "error": (
                "RCW 49.58: could not parse a closed salary range with both a minimum and maximum "
                f"(got {text!r})."
            ),
        }
    low = _as_float(match.group(1))
    high = _as_float(match.group(2))
    if low <= 0 or high <= 0 or high < low:
        return {"ok": False, "error": f"RCW 49.58: invalid range {low}–{high}."}
    return {"ok": True, "min": low, "max": high, "range_text": f"${low:,.0f} – ${high:,.0f}"}


def posting_from_band(band: dict, benefits_summary: Optional[str] = None) -> Dict[str, Any]:
    """Build a compliant posting payload from a compensation_bands document."""
    if not band or band.get("error"):
        return {"ok": False, "error": band.get("error") if isinstance(band, dict) else "Missing compensation band."}

    low = _as_float(band.get("min") or band.get("minSalary") or band.get("salary_min"))
    high = _as_float(band.get("max") or band.get("maxSalary") or band.get("salary_max"))
    if low <= 0 or high <= 0:
        return {"ok": False, "error": "RCW 49.58: compensation band is missing min/max salary."}
    if high < low:
        return {"ok": False, "error": "RCW 49.58: compensation band max is below min."}

    benefits = (
        benefits_summary
        or band.get("benefitsSummary")
        or band.get("benefits")
        or (
            "Medical and dental coverage, employer-sponsored retirement (401k) with match, "
            "and paid time off per company policy."
        )
    )
    range_text = f"${low:,.0f} – ${high:,.0f}"
    check = validate_salary_range_text(range_text)
    if not check.get("ok"):
        return check
    return {
        "ok": True,
        "salary_min": low,
        "salary_max": high,
        "salary_range": range_text,
        "benefits_summary": benefits,
        "job_family": band.get("jobFamily") or band.get("job_family"),
        "level": band.get("level") or band.get("jobLevel"),
    }
