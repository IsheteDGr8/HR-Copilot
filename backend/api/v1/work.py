"""Work queue API — list/create/patch agent-run work items."""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core.security.jwt_auth import verify_jwt
from tools.azure_cosmos import (
    WORK_PRIORITIES,
    WORK_SOURCES,
    WORK_STATUSES,
    create_work_item,
    get_work_item,
    list_work_items,
    update_work_item,
)

router = APIRouter(prefix="/work", tags=["work"])


class WorkItemCreate(BaseModel):
    title: str = Field(..., min_length=1)
    source: Optional[str] = "adhoc"
    category: Optional[str] = None
    status: Optional[str] = "queued"
    priority: Optional[str] = "normal"
    summary: Optional[str] = None
    run_id: Optional[str] = None
    linked_chat_id: Optional[str] = None
    linked_ticket_id: Optional[str] = None
    subject: Optional[Dict[str, Any]] = None
    progress: Optional[int] = 0


class WorkItemPatch(BaseModel):
    status: Optional[str] = None
    title: Optional[str] = None
    source: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[str] = None
    summary: Optional[str] = None
    progress: Optional[int] = None
    linked_chat_id: Optional[str] = None
    linked_ticket_id: Optional[str] = None
    subject: Optional[Dict[str, Any]] = None


def _to_client(doc: dict) -> dict:
    subject = doc.get("subject") if isinstance(doc.get("subject"), dict) else {}
    name = str(subject.get("name") or "")
    initials = str(subject.get("initials") or "")
    if not initials and name:
        initials = "".join(p[0].upper() for p in name.split()[:2] if p) or "??"
    return {
        "id": doc.get("id"),
        "runId": doc.get("runId") or doc.get("linked_chat_id") or "",
        "userId": doc.get("userId"),
        "title": doc.get("title") or "",
        "source": doc.get("source") or "adhoc",
        "category": doc.get("category") or "",
        "subject": {
            "name": name or "Employee",
            "role": str(subject.get("role") or ""),
            "initials": initials or "??",
        },
        "status": doc.get("status") or "queued",
        "priority": doc.get("priority") or "normal",
        "progress": int(doc.get("progress") or 0),
        "summary": doc.get("summary") or "",
        "linkedTicketId": doc.get("linked_ticket_id") or None,
        "linkedChatId": doc.get("linked_chat_id") or None,
        "createdAt": doc.get("created_at"),
        "updatedAt": doc.get("updated_at"),
        "externalRef": doc.get("linked_ticket_id") or doc.get("id"),
        "updated": doc.get("updated_at") or "",
        "sla": "",
        "automation": None,
        "steps": [],
        "messages": [],
        "canvas": {"kind": "record", "items": []},
    }


def _user_id(user: dict) -> str:
    return str(user.get("user_id") or user.get("sub") or "anonymous")


@router.get("/items")
async def get_work_items(
    status: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=500),
    user: dict = Depends(verify_jwt),
):
    if status and status not in WORK_STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of {list(WORK_STATUSES)}")
    rows = list_work_items(user_id=_user_id(user), status=status, limit=limit)
    items = [_to_client(r) for r in rows]
    counts: Dict[str, int] = {}
    for it in items:
        st = str(it.get("status") or "queued")
        counts[st] = counts.get(st, 0) + 1
    return {"ok": True, "items": items, "counts": counts}


@router.get("/items/{work_id}")
async def get_one_work_item(work_id: str, user: dict = Depends(verify_jwt)):
    doc = get_work_item(work_id, _user_id(user))
    if not doc:
        raise HTTPException(status_code=404, detail="Work item not found")
    return {"ok": True, "item": _to_client(doc), "raw": doc}


@router.post("/items")
async def post_work_item(body: WorkItemCreate, user: dict = Depends(verify_jwt)):
    if body.source and body.source not in WORK_SOURCES:
        raise HTTPException(status_code=400, detail=f"source must be one of {list(WORK_SOURCES)}")
    if body.status and body.status not in WORK_STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of {list(WORK_STATUSES)}")
    if body.priority and body.priority not in WORK_PRIORITIES:
        raise HTTPException(status_code=400, detail=f"priority must be one of {list(WORK_PRIORITIES)}")
    saved = create_work_item(
        user_id=_user_id(user),
        title=body.title,
        source=body.source or "adhoc",
        category=body.category or "",
        status=body.status or "queued",
        priority=body.priority or "normal",
        summary=body.summary or "",
        run_id=body.run_id or "",
        linked_chat_id=body.linked_chat_id or "",
        linked_ticket_id=body.linked_ticket_id or "",
        subject=body.subject,
        progress=body.progress or 0,
    )
    return {"ok": True, "item": _to_client(saved)}


@router.patch("/items/{work_id}")
async def patch_work_item(work_id: str, body: WorkItemPatch, user: dict = Depends(verify_jwt)):
    updates: Dict[str, Any] = {}
    if body.status is not None:
        if body.status not in WORK_STATUSES:
            raise HTTPException(status_code=400, detail=f"status must be one of {list(WORK_STATUSES)}")
        updates["status"] = body.status
    if body.source is not None:
        if body.source not in WORK_SOURCES:
            raise HTTPException(status_code=400, detail=f"source must be one of {list(WORK_SOURCES)}")
        updates["source"] = body.source
    if body.priority is not None:
        if body.priority not in WORK_PRIORITIES:
            raise HTTPException(status_code=400, detail=f"priority must be one of {list(WORK_PRIORITIES)}")
        updates["priority"] = body.priority
    if body.title is not None:
        updates["title"] = body.title
    if body.category is not None:
        updates["category"] = body.category
    if body.summary is not None:
        updates["summary"] = body.summary
    if body.progress is not None:
        updates["progress"] = body.progress
    if body.linked_chat_id is not None:
        updates["linked_chat_id"] = body.linked_chat_id
    if body.linked_ticket_id is not None:
        updates["linked_ticket_id"] = body.linked_ticket_id
    if body.subject is not None:
        updates["subject"] = body.subject
    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")
    saved = update_work_item(work_id, updates, user_id=_user_id(user))
    if not saved:
        raise HTTPException(status_code=404, detail="Work item not found")
    return {"ok": True, "item": _to_client(saved)}
