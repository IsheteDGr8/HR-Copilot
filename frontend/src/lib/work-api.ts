"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import type { WorkItem, WorkSource, WorkStatus } from "@/lib/hr-data"

const AUTH_TOKEN_KEY = "auth_token"
const POLL_MS = 4000
const NOTIFY_STATUSES = new Set<WorkStatus>(["completed", "needs_approval", "failed"])

const WORK_SOURCES: WorkSource[] = [
  "onboarding",
  "recruiting",
  "helpdesk",
  "ticketing",
  "attendance",
  "leave",
  "documents",
  "adhoc",
]
const WORK_STATUSES: WorkStatus[] = [
  "queued",
  "running",
  "needs_approval",
  "blocked",
  "completed",
  "failed",
]

function authHeaders(): HeadersInit {
  const token =
    (typeof window !== "undefined" && localStorage.getItem(AUTH_TOKEN_KEY)) || "mock-jwt-token"
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
}

export type WorkItemCreate = {
  title: string
  source?: string
  category?: string
  status?: string
  priority?: string
  summary?: string
  run_id?: string
  linked_chat_id?: string
  linked_ticket_id?: string
  subject?: { name: string; role: string; initials: string }
  progress?: number
}

export type WorkItemPatch = Partial<Omit<WorkItemCreate, "title">> & { title?: string }

type WorkListResponse = {
  ok: boolean
  items: WorkItem[]
  counts: Record<string, number>
}

function coerceWorkItem(raw: Record<string, unknown>): WorkItem {
  const source = WORK_SOURCES.includes(raw.source as WorkSource)
    ? (raw.source as WorkSource)
    : "adhoc"
  const status = WORK_STATUSES.includes(raw.status as WorkStatus)
    ? (raw.status as WorkStatus)
    : "queued"
  const subjectRaw = (raw.subject && typeof raw.subject === "object" ? raw.subject : {}) as {
    name?: string
    role?: string
    initials?: string
  }
  const name = subjectRaw.name || "Employee"
  const initials =
    subjectRaw.initials ||
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || "")
      .join("") ||
    "??"
  const updatedAt = String(raw.updatedAt || raw.updated_at || raw.updated || "")
  return {
    id: String(raw.id || ""),
    title: String(raw.title || "Untitled task"),
    source,
    category: String(raw.category || ""),
    subject: {
      name,
      role: subjectRaw.role || "",
      initials,
    },
    status,
    automation: (raw.automation as string | null | undefined) ?? null,
    priority:
      raw.priority === "urgent" || raw.priority === "high" || raw.priority === "low"
        ? raw.priority
        : "normal",
    sla: String(raw.sla || ""),
    updated: updatedAt,
    updatedAt,
    createdAt: raw.createdAt ? String(raw.createdAt) : undefined,
    externalRef: String(raw.externalRef || raw.linkedTicketId || raw.id || ""),
    progress: Number(raw.progress || 0),
    summary: String(raw.summary || ""),
    steps: Array.isArray(raw.steps) ? (raw.steps as WorkItem["steps"]) : [],
    messages: Array.isArray(raw.messages) ? (raw.messages as WorkItem["messages"]) : [],
    canvas:
      raw.canvas && typeof raw.canvas === "object"
        ? (raw.canvas as WorkItem["canvas"])
        : { kind: "record", items: [] },
    linkedChatId: (raw.linkedChatId as string | null | undefined) || null,
    linkedTicketId: (raw.linkedTicketId as string | null | undefined) || null,
    runId: raw.runId ? String(raw.runId) : undefined,
  }
}

export async function fetchWork(status?: string): Promise<WorkListResponse> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : ""
  const res = await fetch(`/api/v1/work/items${qs}`, { headers: authHeaders() })
  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error(err?.detail || `Failed to load work queue (${res.status})`)
  }
  const data = (await res.json()) as { ok?: boolean; items?: unknown[]; counts?: Record<string, number> }
  const items = (data.items || []).map((row) => coerceWorkItem((row || {}) as Record<string, unknown>))
  return { ok: true, items, counts: data.counts || {} }
}

export async function fetchWorkItem(id: string): Promise<WorkItem> {
  const res = await fetch(`/api/v1/work/items/${encodeURIComponent(id)}`, { headers: authHeaders() })
  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error(err?.detail || `Work item not found (${res.status})`)
  }
  const data = await res.json()
  return coerceWorkItem((data.item || {}) as Record<string, unknown>)
}

export async function createWorkItem(body: WorkItemCreate): Promise<WorkItem> {
  const res = await fetch("/api/v1/work/items", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error(err?.detail || `Failed to create work item (${res.status})`)
  }
  const data = await res.json()
  return coerceWorkItem((data.item || {}) as Record<string, unknown>)
}

export async function patchWorkItem(id: string, body: WorkItemPatch): Promise<WorkItem> {
  const res = await fetch(`/api/v1/work/items/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error(err?.detail || `Failed to update work item (${res.status})`)
  }
  const data = await res.json()
  return coerceWorkItem((data.item || {}) as Record<string, unknown>)
}

let pollTimer: ReturnType<typeof setInterval> | null = null
let focusHandler: (() => void) | null = null
let subscribers = 0
let prevStatusById: Record<string, WorkStatus> = {}
let sawFirstSnapshot = false
let inFlight: Promise<void> | null = null

type SharedWorkState = {
  items: WorkItem[]
  counts: Record<string, number>
  loading: boolean
  error: string | null
}

const listeners = new Set<(state: SharedWorkState) => void>()
let shared: SharedWorkState = {
  items: [],
  counts: {},
  loading: true,
  error: null,
}

function emit(next: SharedWorkState) {
  shared = next
  listeners.forEach((listener) => listener(shared))
}

function notifyTransitions(nextItems: WorkItem[]) {
  if (!sawFirstSnapshot) {
    sawFirstSnapshot = true
    const snap: Record<string, WorkStatus> = {}
    for (const item of nextItems) snap[item.id] = item.status
    prevStatusById = snap
    return
  }
  for (const item of nextItems) {
    const prev = prevStatusById[item.id]
    if (prev && prev !== item.status && NOTIFY_STATUSES.has(item.status)) {
      const description =
        item.status === "needs_approval"
          ? "Needs your approval"
          : item.status === "failed"
            ? "Failed"
            : "Completed"
      const fn = item.status === "failed" ? toast.error : item.status === "needs_approval" ? toast : toast.success
      fn(`Task ${item.id} finished: ${item.title}`, { description })
    }
  }
  const snap: Record<string, WorkStatus> = {}
  for (const item of nextItems) snap[item.id] = item.status
  prevStatusById = snap
}

export async function reloadWorkQueue(silent = false): Promise<void> {
  if (inFlight) return inFlight
  inFlight = (async () => {
    if (!silent) emit({ ...shared, loading: true, error: null })
    try {
      const data = await fetchWork()
      notifyTransitions(data.items)
      emit({ items: data.items, counts: data.counts, loading: false, error: null })
    } catch (e) {
      emit({
        ...shared,
        loading: false,
        error: e instanceof Error ? e.message : "Failed to load work queue",
      })
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

function onFocus() {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return
  void reloadWorkQueue(true)
}

function ensurePolling() {
  if (typeof window === "undefined") return
  if (pollTimer) return
  void reloadWorkQueue(subscribers > 0 && shared.items.length > 0)
  pollTimer = setInterval(() => {
    void reloadWorkQueue(true)
  }, POLL_MS)
  focusHandler = onFocus
  window.addEventListener("focus", focusHandler)
  document.addEventListener("visibilitychange", focusHandler)
}

function releasePolling() {
  subscribers = Math.max(0, subscribers - 1)
  if (subscribers > 0 || typeof window === "undefined") return
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  if (focusHandler) {
    window.removeEventListener("focus", focusHandler)
    document.removeEventListener("visibilitychange", focusHandler)
    focusHandler = null
  }
}

export function useWorkQueue() {
  const [state, setState] = useState<SharedWorkState>(shared)

  useEffect(() => {
    listeners.add(setState)
    subscribers += 1
    ensurePolling()
    setState(shared)
    return () => {
      listeners.delete(setState)
      releasePolling()
    }
  }, [])

  const reload = useCallback((silent = false) => reloadWorkQueue(silent), [])

  const activeCount = (state.counts.running || 0) + (state.counts.needs_approval || 0)

  return {
    items: state.items,
    counts: state.counts,
    loading: state.loading,
    error: state.error,
    reload,
    activeCount,
  }
}
