"use client"

import { useEffect, useState } from "react"
import {
  Briefcase,
  CheckCircle2,
  DollarSign,
  Gift,
  Loader2,
  MapPin,
  Send,
} from "lucide-react"
import { toast } from "sonner"
import { useChat } from "@/lib/chat-store"

export type RecruitingPostingData = {
  title?: string
  job_family?: string
  level?: string
  location?: string
  salary_range?: string
  salary_min?: number
  salary_max?: number
  benefits_summary?: string
  body?: string
  letter_markdown?: string
  required_skills?: string[]
  must_haves?: string
  interview_plan?: string
  status?: string
  [key: string]: unknown
}

type Props = {
  data?: RecruitingPostingData | null
}

function asText(value: unknown, fallback = ""): string {
  if (value == null) return fallback
  const s = String(value).trim()
  return s || fallback
}

export function RecruitingWorkflow({ data }: Props) {
  const sendMessage = useChat((s) => s.sendMessage)
  const isRunning = useChat((s) => s.isRunning)
  const [submitted, setSubmitted] = useState(false)

  const title = asText(data?.title, "Job posting")
  const location = asText(data?.location)
  const salary = asText(data?.salary_range)
  const benefits = asText(data?.benefits_summary)
  const body = asText(data?.body || data?.letter_markdown)
  const level = asText(data?.level)
  const family = asText(data?.job_family)
  const status = asText(data?.status, "awaiting_approval")

  useEffect(() => {
    setSubmitted(false)
  }, [data])

  const confirmPublish = async () => {
    setSubmitted(true)
    try {
      await sendMessage(
        `[POSTING APPROVED] Publish the compliant job posting for ${title} to LinkedIn.`,
      )
      toast.success("Publish approval sent")
    } catch (err) {
      setSubmitted(false)
      toast.error(err instanceof Error ? err.message : "Failed to submit approval")
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary">
            <Briefcase className="h-4 w-4 text-navy" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-foreground">{title}</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {[family, level, status].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {location ? (
          <div className="rounded-xl border border-border bg-white p-3 shadow-sm">
            <p className="mb-1 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
              <MapPin className="h-3 w-3" />
              Location
            </p>
            <p className="text-[13px] text-foreground">{location}</p>
          </div>
        ) : null}
        {salary ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 sm:col-span-1">
            <p className="mb-1 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wide text-emerald-700">
              <DollarSign className="h-3 w-3" />
              Salary (RCW 49.58)
            </p>
            <p className="text-[13px] font-semibold text-emerald-900">{salary}</p>
          </div>
        ) : null}
        {benefits ? (
          <div className="rounded-xl border border-border bg-white p-3 shadow-sm sm:col-span-1">
            <p className="mb-1 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
              <Gift className="h-3 w-3" />
              Benefits
            </p>
            <p className="line-clamp-3 text-[12.5px] leading-relaxed text-foreground">{benefits}</p>
          </div>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-white p-4 shadow-sm">
        <p className="mb-2 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
          Job description (read-only)
        </p>
        <textarea
          readOnly
          value={body || "No job description body was returned."}
          className="min-h-[280px] w-full flex-1 resize-y rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-[13px] leading-relaxed text-foreground outline-none"
        />
      </div>

      <div className="sticky bottom-0 border-t border-border bg-background/95 pt-3 backdrop-blur">
        {submitted ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2.5 text-[12.5px] text-foreground shadow-sm">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            Approval submitted. Publishing to LinkedIn…
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void confirmPublish()}
            disabled={isRunning || !body}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-navy px-3 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-navy/90 disabled:opacity-50"
          >
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Confirm &amp; Publish
          </button>
        )}
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Sends <span className="font-mono text-foreground">[POSTING APPROVED]</span> to the
          Execution agent.
        </p>
      </div>
    </div>
  )
}
