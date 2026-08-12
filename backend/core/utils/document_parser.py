"""Extract plain text from uploaded documents (PDF / text)."""

from __future__ import annotations

import logging
from pathlib import Path

import fitz  # PyMuPDF

logger = logging.getLogger(__name__)

_TEXT_EXTENSIONS = {
    ".txt",
    ".md",
    ".markdown",
    ".csv",
    ".json",
    ".log",
    ".text",
    ".html",
    ".htm",
    ".xml",
    ".yaml",
    ".yml",
}


def extract_text_from_upload(file_bytes: bytes, filename: str) -> str:
    """Return extracted text from an uploaded file.

    PDFs are parsed with PyMuPDF (`fitz`). Other common text-like files are
    decoded as UTF-8 (with replacement for bad bytes).
    """
    if not file_bytes:
        raise ValueError("Uploaded file is empty.")

    name = (filename or "upload").strip() or "upload"
    suffix = Path(name).suffix.lower()

    if suffix == ".pdf" or _looks_like_pdf(file_bytes):
        return _extract_pdf(file_bytes, name)

    if suffix in _TEXT_EXTENSIONS or suffix == "":
        return _decode_text(file_bytes)

    # Last resort: try UTF-8 text, then PDF open.
    try:
        text = _decode_text(file_bytes)
        if text.strip():
            return text
    except Exception:
        pass

    try:
        return _extract_pdf(file_bytes, name)
    except Exception as exc:
        raise ValueError(
            f"Unsupported or unreadable file type for '{name}'. "
            "Upload a PDF or plain-text file."
        ) from exc


def _looks_like_pdf(file_bytes: bytes) -> bool:
    return file_bytes[:5] == b"%PDF-"


def _extract_pdf(file_bytes: bytes, filename: str) -> str:
    try:
        with fitz.open(stream=file_bytes, filetype="pdf") as doc:
            parts: list[str] = []
            for page in doc:
                page_text = page.get_text("text") or ""
                if page_text.strip():
                    parts.append(page_text.strip())
            text = "\n\n".join(parts).strip()
            if not text:
                raise ValueError(f"No extractable text found in PDF '{filename}'.")
            return text
    except ValueError:
        raise
    except Exception as exc:
        logger.exception("PDF extraction failed for %s", filename)
        raise ValueError(f"Failed to parse PDF '{filename}': {exc}") from exc


def _decode_text(file_bytes: bytes) -> str:
    text = file_bytes.decode("utf-8", errors="replace").strip()
    if not text:
        raise ValueError("Text file is empty.")
    return text
