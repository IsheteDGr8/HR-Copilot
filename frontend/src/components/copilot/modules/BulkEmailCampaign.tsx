"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, Loader2, Mail, Send, Users } from "lucide-react"
import { toast } from "sonner"
import { useChat } from "@/lib/chat-store"

export type BulkEmailData = {
  campaign_id?: string
  title?: string
  subject?: string
  body_template?: string
  recipient_count?: number
  recipients_preview?: Array<{
    name?: string
    email?: string
    department?: string
    body?: string
  }>
  audience?: {
    department?: string | null
    status?: string
    search?: string | null
  }
  personalization_tokens?: string[]
  [key: string]: unknown
}

type Props = {
  data?: BulkEmailData | null
}

export function BulkEmailCampaign({ data }: Props) {
  const sendMessage = useChat((s) => s.sendMessage)
  const isRunning = useChat((s) => s.isRunning)
  const [subject, setSubject] = useState(String(data?.subject || ""))
  const [bodyTemplate, setBodyTemplate] = useState(String(data?.body_template || ""))
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    setSubject(String(data?.subject || ""))
    setBodyTemplate(String(data?.body_template || ""))
    setSubmitted(false)
  }, [data])

  const count = Number(data?.recipient_count || data?.recipients_preview?.length || 0)
  const preview = useMemo(() => data?.recipients_preview ?? [], [data])

  const approveAndSend = async () => {
    const subj = subject.trim()
    const body = bodyTemplate.trim()
    if (!subj || !body) {
      toast.error("Subject and message template are required")
      return
    }
    if (count === 0) {
      toast.error("No recipients in this campaign")
      return
    }
    setSubmitted(true)
    try {
      const approval = [
        "[APPROVED TO SEND] Execute the stashed bulk email campaign with these exact details.",
        `BulkCampaign: ${data?.campaign_id || "yes"}`,
        `Subject: ${subj}, Body template: ${body}`,
      ].join(" ")
      await sendMessage(approval)
      toast.success(`Approval sent — emailing ${count} employees`)
    } catch (err) {
      setSubmitted(false)
      toast.error(err instanceof Error ? err.message : "Failed to submit approval")
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-navy/10 text-navy">
              <Users className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-foreground">
                Bulk email — {data?.title || subject || "Campaign"}
              </p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {count} recipient{count === 1 ? "" : "s"}
                {data?.audience?.department ? ` · ${data.audience.department}` : ""}
                {data?.campaign_id ? (
                  <>
                    {" · "}
                    <span className="font-mono text-foreground">{data.campaign_id}</span>
                  </>
                ) : null}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <p className="mb-2 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
            Subject
          </p>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={submitted || isRunning}
            className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-[13px] outline-none focus:border-navy/40 disabled:opacity-60"
          />
        </div>

        <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <p className="mb-1 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
            Message template
          </p>
          <p className="mb-2 text-[11px] text-muted-foreground">
            Tokens: {(data?.personalization_tokens || ["{{first_name}}", "{{name}}"]).join(", ")}
          </p>
          <textarea
            value={bodyTemplate}
            onChange={(e) => setBodyTemplate(e.target.value)}
            disabled={submitted || isRunning}
            rows={8}
            className="min-h-[140px] w-full resize-y rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-[13px] leading-relaxed outline-none focus:border-navy/40 disabled:opacity-60"
          />
        </div>

        <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <p className="mb-2 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
            <Mail className="size-3.5" />
            Preview (first {Math.min(preview.length, 8)} recipients)
          </p>
          <ul className="max-h-48 space-y-2 overflow-y-auto text-[12px]">
            {preview.map((row) => (
              <li
                key={`${row.email}-${row.name}`}
                className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2"
              >
                <p className="font-medium text-foreground">
                  {row.name || "Employee"}{" "}
                  <span className="font-normal text-muted-foreground">· {row.email}</span>
                </p>
                {row.department && (
                  <p className="text-[11px] text-muted-foreground">{row.department}</p>
                )}
                {row.body && (
                  <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[11px] text-muted-foreground">
                    {row.body}
                  </p>
                )}
              </li>
            ))}
            {preview.length === 0 && (
              <li className="text-muted-foreground">No preview rows available.</li>
            )}
          </ul>
        </div>
      </div>

      <div className="shrink-0 space-y-2 border-t border-border bg-background px-4 py-3">
        {submitted ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2.5 text-[12.5px] shadow-sm">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            Sending to {count} employees…
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void approveAndSend()}
            disabled={isRunning || submitted}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-navy px-3 text-[13px] font-semibold text-white hover:bg-navy/90 disabled:opacity-50"
          >
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Approve &amp; Send to {count || "all"}
          </button>
        )}
        <p className="text-center text-[11px] text-muted-foreground">
          Sends one personalized Gmail message per employee after{" "}
          <span className="font-mono text-foreground">[APPROVED TO SEND]</span>.
        </p>
      </div>
    </div>
  )
}
