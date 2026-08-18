"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Briefcase,
  Calendar,
  Loader2,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  UserRound,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

export type ApplicantRow = {
  id?: string
  name?: string
  job_role?: string
  match_score?: number
  skills?: string[]
  matched_skills?: string[]
  gaps?: string[]
  ai_summary?: string
  summary?: string
  status?: string
  resume_blob_url?: string
  requisitionId?: string
  meeting_link?: string
  [key: string]: unknown
}

export type ApplicantTrackerData = {
  requisition_id?: string
  job_role?: string
  required_skills?: string[]
  applicants?: ApplicantRow[]
  recommendations?: ApplicantRow[]
  summary?: string
  [key: string]: unknown
}

type Props = {
  data?: ApplicantTrackerData | null
}

const AUTH_TOKEN_KEY = "auth_token"

function authHeaders(): HeadersInit {
  const token =
    (typeof window !== "undefined" && localStorage.getItem(AUTH_TOKEN_KEY)) || "mock-jwt-token"
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((v) => String(v).trim()).filter(Boolean)
}

function cleanSummary(raw: unknown): string {
  const text = String(raw || "").trim()
  if (!text) return "No fit summary available yet."
  // Strip legacy "Resume excerpt:" dumps if an old Cosmos doc is still loaded.
  const cut = text.search(/\bResume excerpt:\s*/i)
  if (cut >= 0) return text.slice(0, cut).trim() || "No fit summary available yet."
  return text
}

function scoreTone(score: number): {
  label: string
  bar: string
  track: string
  text: string
  ring: string
} {
  if (score > 80) {
    return {
      label: "Strong match",
      bar: "[&_[data-slot=progress-indicator]]:bg-emerald-400",
      track: "bg-emerald-500/15",
      text: "text-success",
      ring: "border-emerald-500/30",
    }
  }
  if (score >= 50) {
    return {
      label: "Partial match",
      bar: "[&_[data-slot=progress-indicator]]:bg-amber-400",
      track: "bg-amber-500/15",
      text: "text-amber-700",
      ring: "border-amber-300",
    }
  }
  return {
    label: "Weak match",
    bar: "[&_[data-slot=progress-indicator]]:bg-rose-400",
    track: "bg-rose-500/15",
    text: "text-rose-700",
    ring: "border-rose-300",
  }
}

function statusVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  const s = status.toLowerCase()
  if (s === "shortlisted" || s === "interviewing") return "default"
  if (s === "rejected") return "destructive"
  return "secondary"
}

export function ApplicantTracker({ data }: Props) {
  const requisitionId = String(data?.requisition_id || "unassigned")
  const jobRole = String(data?.job_role || "").trim()
  const initialRows = useMemo(
    () => (data?.applicants as ApplicantRow[]) || (data?.recommendations as ApplicantRow[]) || [],
    [data],
  )
  const [rows, setRows] = useState<ApplicantRow[]>(initialRows)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!requisitionId) return
    setLoading(true)
    try {
      const res = await fetch(
        `/api/v1/recruiting/applicants?requisition_id=${encodeURIComponent(requisitionId)}`,
        { headers: authHeaders(), cache: "no-store" },
      )
      if (!res.ok) throw new Error(`Failed to load applicants (${res.status})`)
      const json = (await res.json()) as { applicants?: ApplicantRow[] }
      setRows(json.applicants || [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to load applicants")
    } finally {
      setLoading(false)
    }
  }, [requisitionId])

  useEffect(() => {
    setRows(initialRows)
  }, [initialRows])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const patch = async (
    applicant: ApplicantRow,
    body: Record<string, unknown>,
    successMsg: string,
  ) => {
    const id = String(applicant.id || "")
    if (!id) {
      toast.error("Applicant is missing an id")
      return
    }
    setBusyId(id)
    try {
      const res = await fetch(`/api/v1/recruiting/applicants/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          requisition_id: applicant.requisitionId || requisitionId,
          ...body,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.detail || `Update failed (${res.status})`)
      }
      const json = (await res.json()) as {
        applicant?: ApplicantRow
        interview?: { meeting_link?: string }
      }
      if (json.applicant) {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...json.applicant } : r)))
      }
      if (json.interview?.meeting_link) {
        toast.success(`${successMsg} · ${json.interview.meeting_link}`)
      } else {
        toast.success(successMsg)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
      <header className="rounded-xl border border-border bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Applicant tracker
            </p>
            <h2 className="mt-1 truncate text-[16px] font-semibold text-foreground">
              {jobRole || "Open requisition"}
            </h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Req <span className="font-mono text-muted-foreground">{requisitionId}</span>
              {asStringList(data?.required_skills).length > 0 ? (
                <span className="text-muted-foreground">
                  {" "}
                  · {asStringList(data?.required_skills).length} required skills
                </span>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground transition hover:bg-secondary"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </button>
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-[13px] text-muted-foreground">
          No applicants yet. Screen a resume to populate this requisition.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((a) => {
            const id = String(a.id || a.name)
            const score = Math.max(0, Math.min(100, Number(a.match_score || 0)))
            const tone = scoreTone(score)
            const skills = asStringList(a.skills || a.matched_skills)
            const gaps = asStringList(a.gaps)
            const role = String(a.job_role || jobRole || "Candidate").trim()
            const status = String(a.status || "Applied")
            const busy = busyId === a.id
            const summary = cleanSummary(a.ai_summary || a.summary)

            return (
              <article
                key={id}
                className="flex flex-col overflow-hidden rounded-xl border border-border bg-white"
              >
                <div className="flex flex-col gap-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-secondary">
                        <UserRound className="h-5 w-5 text-foreground" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="truncate text-[15px] font-semibold text-foreground">
                          {a.name || "Candidate"}
                        </h3>
                        <p className="mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] text-muted-foreground">
                          <Briefcase className="h-3.5 w-3.5 shrink-0" />
                          {role}
                        </p>
                        <div className="mt-2">
                          <Badge variant={statusVariant(status)} className="capitalize">
                            {status}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    <div
                      className={cn(
                        "flex h-[4.25rem] w-[4.25rem] shrink-0 flex-col items-center justify-center rounded-full border bg-muted/50",
                        tone.ring,
                      )}
                    >
                      <span className={cn("text-[18px] font-semibold tabular-nums leading-none", tone.text)}>
                        {score}
                      </span>
                      <span className="mt-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                        match
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className={cn("font-medium", tone.text)}>{tone.label}</span>
                      <span className="tabular-nums text-muted-foreground">{score}/100</span>
                    </div>
                    <Progress
                      value={score}
                      className={cn("h-2", tone.track, tone.bar)}
                    />
                  </div>

                  <p className="text-[13px] leading-relaxed text-muted-foreground">{summary}</p>

                  <div className="space-y-2">
                    {skills.length > 0 ? (
                      <div>
                        <p className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
                          Matched skills
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {skills.map((s) => (
                            <Badge
                              key={`s-${id}-${s}`}
                              className="border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                            >
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {gaps.length > 0 ? (
                      <div>
                        <p className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
                          Gaps
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {gaps.map((s) => (
                            <Badge
                              key={`g-${id}-${s}`}
                              variant="outline"
                              className="border-rose-500/25 bg-rose-500/10 text-rose-800"
                            >
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {a.meeting_link ? (
                    <a
                      href={String(a.meeting_link)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[12px] text-sky-700 underline-offset-2 hover:underline"
                    >
                      Open interview meeting link
                    </a>
                  ) : null}
                </div>

                <div className="mt-auto flex flex-wrap gap-2 border-t border-border bg-secondary px-4 py-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void patch(a, { status: "Shortlisted" }, "Candidate shortlisted")}
                    className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md bg-navy px-3 text-[12.5px] font-medium text-white transition hover:bg-navy/90 disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ThumbsUp className="h-3.5 w-3.5" />
                    )}
                    Shortlist
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void patch(
                        a,
                        { schedule_interview: true, status: "Interviewing" },
                        "Interview scheduled (mock Outlook)",
                      )
                    }
                    className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-sky-500/30 bg-sky-500/10 px-3 text-[12.5px] font-medium text-sky-800 transition hover:bg-sky-500/20 disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Calendar className="h-3.5 w-3.5" />
                    )}
                    Schedule Interview
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void patch(a, { status: "Rejected" }, "Candidate rejected")}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border bg-transparent px-3 text-[12.5px] font-medium text-muted-foreground transition hover:bg-secondary disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ThumbsDown className="h-3.5 w-3.5" />
                    )}
                    Reject
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
      </div>
    </div>
  )
}
