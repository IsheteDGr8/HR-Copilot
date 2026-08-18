"use client"

import { useEffect, useState } from "react"
import {
  BookOpen,
  CheckCircle2,
  Loader2,
  MessageSquareWarning,
  Send,
  ShieldAlert,
} from "lucide-react"
import { toast } from "sonner"
import { useChat } from "@/lib/chat-store"

export type HelpdeskTicketData = {
  ticket_id?: string
  employee_id?: string
  employee_name?: string
  employee_email?: string
  ticket_category?: string
  priority_level?: string
  question?: string
  ai_summary?: string
  policy_reference?: string
  drafted_response?: string
  suggested_response?: string
  status?: string
  policy_mode?: string
  [key: string]: unknown
}

type Props = {
  data?: HelpdeskTicketData | null
}

const AUTH_TOKEN_KEY = "auth_token"

function authHeaders(): HeadersInit {
  const token =
    (typeof window !== "undefined" && localStorage.getItem(AUTH_TOKEN_KEY)) || "mock-jwt-token"
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
}

export function TicketResolver({ data }: Props) {
  const sendMessage = useChat((s) => s.sendMessage)
  const isRunning = useChat((s) => s.isRunning)
  const [response, setResponse] = useState(
    String(data?.drafted_response || data?.suggested_response || ""),
  )
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)

  const ticketId = String(data?.ticket_id || "")
  const email = String(data?.employee_email || "").trim()
  const name = String(data?.employee_name || "Employee")
  const policyRef = String(data?.policy_reference || "").trim()

  useEffect(() => {
    setResponse(String(data?.drafted_response || data?.suggested_response || ""))
    setSubmitted(false)
  }, [data])

  const patchTicket = async (body: Record<string, unknown>) => {
    if (!ticketId) return
    setBusy(true)
    try {
      const res = await fetch(`/api/v1/helpdesk/tickets/${encodeURIComponent(ticketId)}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ employee_id: data?.employee_id, ...body }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.detail || `Update failed (${res.status})`)
      }
    } finally {
      setBusy(false)
    }
  }

  const approveAndSend = async () => {
    const body = response.trim()
    if (!body) {
      toast.error("Drafted response cannot be empty")
      return
    }
    const to = email || "employee@company.com"
    setSubmitted(true)
    try {
      await patchTicket({ suggested_response: body, status: "Pending" })
      const approval = [
        "[APPROVED TO SEND] Please execute the Gmail send tool with these exact details.",
        `TicketId: ${ticketId}, To: ${to}, Subject: HR Helpdesk: ${data?.ticket_category || "Your question"}, Body: ${body}`,
      ].join(" ")
      await sendMessage(approval)
      toast.success("Approval sent — resolving ticket & emailing response")
    } catch (err) {
      setSubmitted(false)
      toast.error(err instanceof Error ? err.message : "Failed to submit approval")
    }
  }

  const askForInfo = async () => {
    try {
      await patchTicket({ status: "Pending", notes: "Awaiting more info from employee" })
      toast.success("Ticket marked Pending — waiting for more information")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update ticket")
    }
  }

  const escalate = async () => {
    try {
      await patchTicket({
        status: "Pending",
        priority: "Urgent",
        notes: "Escalated to senior HR",
      })
      toast.success("Ticket escalated (Urgent / Pending)")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to escalate")
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <p className="text-[15px] font-semibold text-foreground">
            Helpdesk — {data?.ticket_category || "General"}
          </p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {name}
            {email ? ` · ${email}` : ""}
            {ticketId ? (
              <>
                {" · "}
                <span className="font-mono text-foreground">{ticketId}</span>
              </>
            ) : null}
            {data?.priority_level ? ` · ${data.priority_level} priority` : null}
          </p>
          {data?.ai_summary ? (
            <p className="mt-2 text-[12.5px] text-muted-foreground">{data.ai_summary}</p>
          ) : null}
        </div>

        <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <p className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
            Employee question
          </p>
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
            {data?.question || "—"}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-secondary/60 p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
              <BookOpen className="h-3.5 w-3.5" />
              Corporate policy reference
            </p>
            {data?.policy_mode ? (
              <span className="rounded-md border border-border bg-white px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {String(data.policy_mode)}
              </span>
            ) : null}
          </div>
          <blockquote className="max-h-52 overflow-y-auto border-l-2 border-navy/40 bg-white py-2 pl-3 pr-2">
            <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-foreground">
              {policyRef || "No policy excerpt retrieved for this question."}
            </p>
          </blockquote>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Cross-check the drafted email against this excerpt before approving.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <p className="mb-2 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
            Drafted response (editable)
          </p>
          <textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            disabled={submitted || isRunning}
            rows={10}
            className="min-h-[160px] w-full resize-y rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-[13px] leading-relaxed text-foreground outline-none focus:border-navy/40 disabled:opacity-60"
          />
        </div>
      </div>

      <div className="shrink-0 space-y-2 border-t border-border bg-background px-4 py-3">
        {submitted ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2.5 text-[12.5px] text-foreground shadow-sm">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            Approval submitted. Sending & resolving…
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void approveAndSend()}
              disabled={isRunning || busy}
              className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-navy px-3 text-[13px] font-semibold text-white hover:bg-navy/90 disabled:opacity-50"
            >
              {isRunning || busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Approve &amp; Send
            </button>
            <button
              type="button"
              onClick={() => void askForInfo()}
              disabled={busy || isRunning}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-[12.5px] text-foreground hover:bg-secondary disabled:opacity-50"
            >
              <MessageSquareWarning className="h-4 w-4" />
              Ask for Info
            </button>
            <button
              type="button"
              onClick={() => void escalate()}
              disabled={busy || isRunning}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 text-[12.5px] text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            >
              <ShieldAlert className="h-4 w-4" />
              Escalate
            </button>
          </div>
        )}
        <p className="text-center text-[11px] text-muted-foreground">
          Approve &amp; Send appends{" "}
          <span className="font-mono text-foreground">[APPROVED TO SEND]</span> and marks the
          ticket Resolved after dispatch.
        </p>
      </div>
    </div>
  )
}
