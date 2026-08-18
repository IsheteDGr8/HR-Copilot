"use client"

import { create } from 'zustand'

// Which module renderer the Side Canvas uses for an artifact. Driven by the
// tool's "_canvas.module" hint, with a tool-name fallback.
export type CanvasModule =
  | 'employee_profile'
  | 'pto'
  | 'org_chart'
  | 'benefits'
  | 'policy'
  | 'action_approval'
  | 'onboarding_checklist'
  | 'onboarding_workflow'
  | 'onboarding_tracker'
  | 'lifecycle_transfer'
  | 'recruiting_posting'
  | 'applicant_tracker'
  | 'helpdesk_ticket'
  | 'hr_dashboard'
  | 'document_creation'
  | 'resume_screening'
  | 'training_tracker'
  | 'schedule_maker'
  | 'email_drafter'
  | 'json'

export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

export interface CanvasAction {
  toolName: string
  params: Record<string, any>
  status: ApprovalStatus
  resolvedAt?: number
  result?: string
  conversationId?: string
}

export interface CanvasArtifact {
  id: string
  module: CanvasModule
  toolName: string
  title: string
  data: any
  createdAt: number
  action?: CanvasAction
}

interface CanvasState {
  /** Which chat the Side Canvas is currently contextualized to. */
  contextConversationId: string | null
  open: boolean
  width: number
  artifacts: CanvasArtifact[]
  activeId: string | null
  byConversationId: Record<string, CanvasArtifact[]>
  activeIdByConversationId: Record<string, string | null>

  openArtifact: (a: {
    module: CanvasModule
    toolName: string
    title: string
    data: any
    conversationId?: string
  }) => void
  openApproval: (a: {
    toolName: string
    title: string
    params: Record<string, any>
    conversationId?: string
  }) => void
  resolveApproval: (id: string, decision: Exclude<ApprovalStatus, 'pending'>) => void
  /** Close the canvas; reopening is handled via `openLatestForContext()` or selecting history. */
  setOpen: (open: boolean) => void
  setWidth: (width: number) => void
  toggle: () => void
  select: (id: string) => void
  /**
   * Set canvas context for the currently selected chat.
   * Switching chats always closes the canvas; it will open again on click.
   */
  setContextConversationId: (conversationId: string | null) => void
  /** Open the most recent canvas artifact for the current context chat. */
  openLatestForContext: () => void
  /** Clear canvas history for a single chat (defaults to current context). */
  clearConversation: (conversationId?: string | null) => void
  /** Clear all canvas history. Mostly for debugging. */
  clear: () => void
}

export const CANVAS_MIN_WIDTH = 320
export const CANVAS_MAX_WIDTH = 720
export const CANVAS_DEFAULT_WIDTH = 440

const STORAGE_KEY = 'hr-copilot-canvas-v2'
const HISTORY_LIMIT_PER_CONVERSATION = 12

function newId(): string {
  return `canvas-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function clampWidth(w: number): number {
  return Math.min(CANVAS_MAX_WIDTH, Math.max(CANVAS_MIN_WIDTH, w))
}

function persist(state: Pick<CanvasState, 'byConversationId' | 'activeIdByConversationId' | 'width'>) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        byConversationId: state.byConversationId,
        activeIdByConversationId: state.activeIdByConversationId,
        width: state.width,
      }),
    )
  } catch {
    // ignore quota / private mode
  }
}

function loadPersisted(): Partial<CanvasState> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as {
      byConversationId?: Record<string, CanvasArtifact[]>
      activeIdByConversationId?: Record<string, string | null>
      width?: number
    }
    return {
      byConversationId: parsed.byConversationId ?? {},
      activeIdByConversationId: parsed.activeIdByConversationId ?? {},
      width: clampWidth(parsed.width ?? CANVAS_DEFAULT_WIDTH),
    }
  } catch {
    return {}
  }
}

const hydrated = loadPersisted()

function clampHistory(list: CanvasArtifact[]): CanvasArtifact[] {
  return list.slice(0, HISTORY_LIMIT_PER_CONVERSATION)
}

export const useCanvas = create<CanvasState>((set, get) => ({
  contextConversationId: null,
  open: false,
  width: hydrated.width ?? CANVAS_DEFAULT_WIDTH,
  artifacts: [],
  activeId: null,
  byConversationId: hydrated.byConversationId ?? {},
  activeIdByConversationId: hydrated.activeIdByConversationId ?? {},

  openArtifact: ({ module, toolName, title, data, conversationId }) =>
    set((state) => {
      const convo = conversationId ?? state.contextConversationId
      const artifact: CanvasArtifact = {
        id: newId(),
        module,
        toolName,
        title,
        data,
        createdAt: Date.now(),
      }
      if (!convo) return state

      const prev = state.byConversationId[convo] ?? []
      const nextList = clampHistory([artifact, ...prev])
      const byConversationId = { ...state.byConversationId, [convo]: nextList }
      const activeIdByConversationId = { ...state.activeIdByConversationId, [convo]: artifact.id }

      const isContext = state.contextConversationId === convo
      const next: CanvasState = {
        ...state,
        byConversationId,
        activeIdByConversationId,
        ...(isContext ? { artifacts: nextList, activeId: artifact.id, open: true } : null),
      } as CanvasState
      persist(next)
      return next
    }),

  openApproval: ({ toolName, title, params, conversationId }) =>
    set((state) => {
      const convo = conversationId ?? state.contextConversationId
      if (!convo) return state

      const artifact: CanvasArtifact = {
        id: newId(),
        module: 'action_approval',
        toolName,
        title,
        data: params,
        createdAt: Date.now(),
        action: { toolName, params, status: 'pending', conversationId: convo },
      }

      const prev = state.byConversationId[convo] ?? []
      const nextList = clampHistory([artifact, ...prev])
      const byConversationId = { ...state.byConversationId, [convo]: nextList }
      const activeIdByConversationId = { ...state.activeIdByConversationId, [convo]: artifact.id }

      const isContext = state.contextConversationId === convo
      const next: CanvasState = {
        ...state,
        byConversationId,
        activeIdByConversationId,
        ...(isContext ? { artifacts: nextList, activeId: artifact.id, open: true } : null),
      } as CanvasState
      persist(next)
      return next
    }),

  resolveApproval: (id, decision) =>
    set((state) => {
      // Find the artifact (across all chats) so approvals are correct even when
      // the canvas isn't currently open for that conversation.
      let found: CanvasArtifact | null = null
      const byConversationId = { ...state.byConversationId }
      for (const [cid, list] of Object.entries(byConversationId)) {
        const a = list.find((x) => x.id === id)
        if (a) {
          found = a
          break
        }
      }

      if (found?.action) {
        const accept = decision === 'approved'
        if (found.action.conversationId) {
          fetch('/api/chat/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              conversationId: found.action.conversationId,
              accept,
              reason: accept ? undefined : 'User rejected the action.',
            }),
          }).catch((err) => console.error('Failed to confirm action:', err))
        } else if (accept && found.action.toolName === 'send_email') {
          fetch('/api/v1/actions/execute', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer mock-jwt-token',
            },
            body: JSON.stringify({
              action_type: 'send_email',
              payload: {
                to: found.action.params.to,
                subject: found.action.params.subject,
                body: found.action.params.body,
              },
            }),
          }).catch((err) => console.error('Failed to execute action:', err))
        }
      }

      for (const [cid, list] of Object.entries(byConversationId)) {
        byConversationId[cid] = list.map((a) =>
          a.id === id && a.action && a.action.status === 'pending'
            ? {
                ...a,
                action: {
                  ...a.action,
                  status: decision,
                  resolvedAt: Date.now(),
                  result:
                    decision === 'approved'
                      ? 'Approved. Execution resumed on the backend.'
                      : 'Discarded. Action was rejected on the backend.',
                },
              }
            : a,
        )
      }

      const next: CanvasState = {
        ...state,
        byConversationId,
      } as CanvasState

      // If we updated the currently viewed chat, also update the visible list.
      if (state.contextConversationId) {
        const ctx = state.contextConversationId
        next.artifacts = byConversationId[ctx] ?? []
      }

      persist(next)
      return next
    }),

  setOpen: (open) =>
    set((state) => {
      return { open }
      // Note: open is intentionally not persisted.
    }),

  setWidth: (width) =>
    set((state) => {
      const w = clampWidth(width)
      const next = { ...state, width: w }
      persist(next)
      return { width: w }
    }),

  toggle: () =>
    set((state) => {
      const open = !state.open
      return { open }
    }),

  select: (activeId) =>
    set((state) => {
      if (!state.contextConversationId) return state
      const activeIdByConversationId = { ...state.activeIdByConversationId, [state.contextConversationId]: activeId }
      const next = { ...state, activeId, open: true, activeIdByConversationId }
      persist(next)
      return next
    }),

  setContextConversationId: (conversationId) =>
    set((state) => {
      const artifacts = conversationId ? state.byConversationId[conversationId] ?? [] : []
      const activeId = conversationId
        ? state.activeIdByConversationId[conversationId] ?? artifacts[0]?.id ?? null
        : null
      return {
        ...state,
        contextConversationId: conversationId,
        open: false,
        artifacts,
        activeId,
      }
    }),

  openLatestForContext: () =>
    set((state) => {
      const cid = state.contextConversationId
      if (!cid) return state
      const artifacts = state.byConversationId[cid] ?? []
      const latest = artifacts[0]
      if (!latest) {
        return { ...state, artifacts: [], activeId: null, open: false }
      }
      const activeIdByConversationId = { ...state.activeIdByConversationId, [cid]: latest.id }
      const next = { ...state, artifacts, activeId: latest.id, open: true, activeIdByConversationId }
      persist(next)
      return next
    }),

  clearConversation: (conversationId) =>
    set((state) => {
      const cid = conversationId ?? state.contextConversationId
      if (!cid) return state
      const byConversationId = { ...state.byConversationId }
      const activeIdByConversationId = { ...state.activeIdByConversationId }
      delete byConversationId[cid]
      delete activeIdByConversationId[cid]

      const isContext = state.contextConversationId === cid
      const next: CanvasState = {
        ...state,
        byConversationId,
        activeIdByConversationId,
        ...(isContext ? { artifacts: [], activeId: null, open: false } : null),
      } as CanvasState
      persist(next)
      return next
    }),

  clear: () => {
    if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEY)
    set({
      contextConversationId: null,
      open: false,
      artifacts: [],
      activeId: null,
      byConversationId: {},
      activeIdByConversationId: {},
    })
  },
}))
