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
  | 'document_creation'
  | 'resume_screening'
  | 'training_tracker'
  | 'schedule_maker'
  | 'email_drafter'
  | 'json'

export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

// Human-in-the-loop action awaiting the HR user's decision. Attached to an
// 'action_approval' artifact.
export interface CanvasAction {
  toolName: string
  params: Record<string, any>
  status: ApprovalStatus
  resolvedAt?: number
  result?: string
  conversationId?: string
}

// A single result surfaced to the right-hand Side Canvas for review. Built from
// a tool ObservationEvent; `data` is the parsed tool payload. For approval
// cards, `action` carries the pending decision.
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
  open: boolean
  artifacts: CanvasArtifact[]
  activeId: string | null

  openArtifact: (a: {
    module: CanvasModule
    toolName: string
    title: string
    data: any
  }) => void
  openApproval: (a: {
    toolName: string
    title: string
    params: Record<string, any>
    conversationId?: string
  }) => void
  resolveApproval: (id: string, decision: Exclude<ApprovalStatus, 'pending'>) => void
  setOpen: (open: boolean) => void
  toggle: () => void
  select: (id: string) => void
  clear: () => void
}

// Keep a short rolling history so the user can flip back to a prior module
// (e.g. the org chart they viewed two questions ago).
const MAX_ARTIFACTS = 24

function newId(): string {
  return `canvas-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export const useCanvas = create<CanvasState>((set) => ({
  open: false,
  artifacts: [],
  activeId: null,

  openArtifact: ({ module, toolName, title, data }) =>
    set((state) => {
      const artifact: CanvasArtifact = {
        id: newId(),
        module,
        toolName,
        title,
        data,
        createdAt: Date.now(),
      }
      const artifacts = [artifact, ...state.artifacts].slice(0, MAX_ARTIFACTS)
      return { artifacts, activeId: artifact.id, open: true }
    }),

  openApproval: ({ toolName, title, params, conversationId }) =>
    set((state) => {
      const artifact: CanvasArtifact = {
        id: newId(),
        module: 'action_approval',
        toolName,
        title,
        data: params,
        createdAt: Date.now(),
        action: { toolName, params, status: 'pending', conversationId },
      }
      const artifacts = [artifact, ...state.artifacts].slice(0, MAX_ARTIFACTS)
      return { artifacts, activeId: artifact.id, open: true }
    }),

  resolveApproval: (id, decision) =>
    set((state) => {
      const artifact = state.artifacts.find(a => a.id === id)
      // decision is always 'approved' | 'rejected' here (resolveApproval is
      // only called with a real decision), so no pending check is needed.
      if (artifact?.action) {
        const accept = decision === 'approved'
        if (artifact.action.conversationId) {
          // Legacy HRAgents WebSocket path: confirm/reject on the server turn.
          fetch('/api/chat/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              conversationId: artifact.action.conversationId,
              accept,
              reason: accept ? undefined : 'User rejected the action.',
            }),
          }).catch((err) => console.error('Failed to confirm action:', err))
        } else if (accept && artifact.action.toolName === 'send_email') {
          // FastAPI SSE path: execute the approved email draft.
          fetch('/api/v1/actions/execute', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer mock-jwt-token',
            },
            body: JSON.stringify({
              action_type: 'send_email',
              payload: {
                to: artifact.action.params.to,
                subject: artifact.action.params.subject,
                body: artifact.action.params.body,
              },
            }),
          }).catch((err) => console.error('Failed to execute action:', err))
        }
      }

      return {
        artifacts: state.artifacts.map((a) =>
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
        ),
      }
    }),

  setOpen: (open) => set({ open }),
  toggle: () => set((state) => ({ open: !state.open })),
  select: (activeId) => set({ activeId, open: true }),
  clear: () => set({ artifacts: [], activeId: null, open: false }),
}))
