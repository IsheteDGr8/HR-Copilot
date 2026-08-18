"""Lightweight corporate-policy RAG over Azure Blob `policies/` PDFs.

Used by the Helpdesk worker when Azure AI Search is unavailable or empty.
Downloads matching blobs, extracts text in-memory (PyMuPDF / pdfplumber), and
returns the most relevant chunk for the employee question.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Tuple

logger = logging.getLogger(__name__)

_POLICY_PREFIX = "policies/"
_CHUNK_SIZE = 900
_CHUNK_OVERLAP = 120


def _tokenize(text: str) -> List[str]:
    return re.findall(r"[a-zA-Z][a-zA-Z0-9+.#-]{2,}", (text or "").lower())


def _extract_pdf_text(data: bytes) -> str:
    """Extract plain text from PDF bytes. Prefers PyMuPDF, then pdfplumber."""
    # PyMuPDF (fitz)
    try:
        import fitz  # type: ignore

        doc = fitz.open(stream=data, filetype="pdf")
        parts: List[str] = []
        for page in doc:
            parts.append(page.get_text("text") or "")
        doc.close()
        text = "\n".join(parts).strip()
        if text:
            return text
    except Exception:
        logger.debug("PyMuPDF extract failed", exc_info=True)

    try:
        import io

        import pdfplumber  # type: ignore

        parts = []
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            for page in pdf.pages:
                parts.append(page.extract_text() or "")
        text = "\n".join(parts).strip()
        if text:
            return text
    except Exception:
        logger.debug("pdfplumber extract failed", exc_info=True)

    # Last resort: decode as text (seeded "PDFs" may be plain in mock mode)
    try:
        return data.decode("utf-8", errors="ignore").strip()
    except Exception:
        return ""


def _chunk_text(text: str) -> List[str]:
    cleaned = re.sub(r"[ \t]+", " ", (text or "")).strip()
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    if not cleaned:
        return []
    if len(cleaned) <= _CHUNK_SIZE:
        return [cleaned]
    chunks: List[str] = []
    i = 0
    while i < len(cleaned):
        chunks.append(cleaned[i : i + _CHUNK_SIZE].strip())
        i += max(1, _CHUNK_SIZE - _CHUNK_OVERLAP)
    return [c for c in chunks if c]


def _score_chunk(query_tokens: List[str], chunk: str) -> float:
    if not query_tokens:
        return 0.0
    tokens = set(_tokenize(chunk))
    if not tokens:
        return 0.0
    hits = sum(1 for t in query_tokens if t in tokens)
    # Prefer denser overlap; slight boost for phrase-ish coverage.
    return hits / len(query_tokens) + (0.05 * hits)


def _list_policy_blobs() -> List[str]:
    from tools.azure_blob import _client
    from core.config import get_settings

    settings = get_settings()
    container = _client().get_container_client(settings.blob_container)
    names: List[str] = []
    seen = set()

    def _add(name: str) -> None:
        if name and name not in seen:
            seen.add(name)
            names.append(name)

    for blob in container.list_blobs(name_starts_with=_POLICY_PREFIX):
        name = getattr(blob, "name", "") or ""
        lower = name.lower()
        if lower.endswith((".pdf", ".txt", ".md")):
            _add(name)

    # Broader scan: handbook / policy / PTO / benefits / NDA / code of conduct PDFs
    # anywhere in the container (local Azure often lacks a policies/ prefix).
    keywords = ("policy", "policies", "handbook", "pto", "benefit", "nda", "conduct", "leave")
    for blob in container.list_blobs():
        name = getattr(blob, "name", "") or ""
        lower = name.lower()
        if not lower.endswith((".pdf", ".txt", ".md")):
            continue
        if lower.startswith("candidates/"):
            continue
        if any(k in lower for k in keywords) or lower.startswith(_POLICY_PREFIX):
            _add(name)

    return names


def search_corporate_policies(query: str, *, top_chunks: int = 2) -> Dict[str, Any]:
    """Download policies/ from Blob, extract text, return the best-matching chunk(s)."""
    q = (query or "").strip()
    if not q:
        return {
            "ok": False,
            "mode": "blob_rag",
            "text": "No policy query provided.",
            "excerpts": [],
        }

    query_tokens = _tokenize(q)
    try:
        from tools.azure_blob import fetch_blob_bytes

        names = _list_policy_blobs()
    except Exception as exc:
        logger.info("Blob policy listing unavailable: %s", exc)
        return {
            "ok": False,
            "mode": "blob_rag",
            "text": "",
            "excerpts": [],
            "error": str(exc),
        }

    if not names:
        return {
            "ok": False,
            "mode": "blob_rag",
            "text": "",
            "excerpts": [],
            "error": "No policy blobs found under policies/.",
        }

    scored: List[Tuple[float, str, str]] = []
    for name in names:
        try:
            raw = fetch_blob_bytes(name)
            text = _extract_pdf_text(raw)
            for chunk in _chunk_text(text):
                score = _score_chunk(query_tokens, chunk)
                # Filename keyword boost
                fname = name.lower()
                if any(t in fname for t in query_tokens[:6]):
                    score += 0.15
                if score > 0:
                    scored.append((score, name, chunk))
        except Exception:
            logger.debug("Failed extracting %s", name, exc_info=True)

    if not scored:
        # Return a short excerpt from the first policy so the UI still has context.
        try:
            from tools.azure_blob import fetch_blob_bytes

            name = names[0]
            text = _extract_pdf_text(fetch_blob_bytes(name))
            chunk = _chunk_text(text)[0] if text else ""
            if chunk:
                scored.append((0.01, name, chunk))
        except Exception:
            pass

    if not scored:
        return {
            "ok": False,
            "mode": "blob_rag",
            "text": "",
            "excerpts": [],
            "error": "Could not extract readable text from policy PDFs.",
        }

    scored.sort(key=lambda x: x[0], reverse=True)
    top = scored[: max(1, top_chunks)]
    excerpts = [
        {"title": name.split("/")[-1], "blob": name, "snippet": chunk, "score": round(score, 3)}
        for score, name, chunk in top
    ]
    text = "\n\n---\n\n".join(f"{e['title']}:\n{e['snippet']}" for e in excerpts)
    logger.info(
        "Blob RAG matched %d chunk(s) for query=%r (best=%s score=%.2f)",
        len(excerpts),
        q[:80],
        excerpts[0]["title"],
        excerpts[0]["score"],
    )
    return {
        "ok": True,
        "mode": "blob_rag",
        "text": text,
        "excerpts": excerpts,
        "source_blobs": [e["blob"] for e in excerpts],
    }
