"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, CheckCircle2, Clock, Loader2, Mail, Users } from "lucide-react"
import { toast } from "sonner"
import { useChat } from "@/lib/chat-store"
import { useCanvas } from "@/lib/canvas-store"
import { draftTimesheetReminders, patchTimesheet } from "@/lib/payroll-api"
import { cn } from "@/lib/utils"

export type TimesheetRow = {
  employee_id?: string
  name?: string
  email?: string
  department?: string
  status?: string
  timesheet_id?: string | null
  total_hours?: number
  overtime_hours?: number
  gross_pay?: number
  anomalies?: string[]
}

export type TimesheetStatusData = {
  pay_period_id?: string
  department?: string | null
  employee_count?: number
  submitted_count?: number
  missing_count?: number
  pending_approval_count?: number
  missing?: TimesheetRow[]
  pending_approval?: TimesheetRow[]
  submitted?: TimesheetRow[]
  flagged?: TimesheetRow[]
  flagged_count?: number
  title?: string
  [key: string]: unknown
}

type Props = {
  data?: TimesheetStatusData | null
}

export function TimesheetStatus({ data }: Props) {
  const isRunning = useChat((s) => s.isRunning)
  const [submitting, setSubmitting] = useState(false)

  const missing = useMemo(() => data?.missing ?? [], [data])
  const pending = useMemo(() => data?.pending_approval ?? [], [data])
  const flagged = useMemo(() => data?.flagged ?? [], [data])
  const period = String(data?.pay_period_id || "Current period")
  const showFlagged = flagged.length > 0

  const remindMissing = async () => {
    if (!missing.length) {
      toast.message("Everyone has submitted for this period")
      return
    }
    setSubmitting(true)
    try {
      const resp = await draftTimesheetReminders({
        pay_period: data?.pay_period_id,
        department: data?.department || undefined,
      })

      if (!resp?.ok || !resp?.campaign) {
        throw new Error("Failed to draft reminder campaign")
      }

      const count = Number(resp.campaign.recipient_count || missing.length || 0)
      useCanvas.getState().openArtifact({
        module: "bulk_email_campaign",
        toolName: "draft_bulk_email",
        title: `Bulk email — ${count} recipients`,
        data: resp.campaign,
      })
      toast.success(`Reminder draft created for ${count} employees`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start reminder")
    } finally {
      setSubmitting(false)
    }
  }

  const approve = async (row: TimesheetRow) => {
    if (!row.timesheet_id) return
    try {
      await patchTimesheet(row.timesheet_id, "approve", row.employee_id)
      toast.success(`Approved ${row.name || "timesheet"}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approve failed")
    }
  }

  const reject = async (row: TimesheetRow) => {
    if (!row.timesheet_id) return
    try {
      await patchTimesheet(row.timesheet_id, "reject", row.employee_id, "Rejected by HR")
      toast.success(`Rejected ${row.name || "timesheet"}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reject failed")
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
            <div>
              <p className="text-[15px] font-semibold text-foreground">
                {data?.title || "Timesheet status"} — {period}
              </p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {data?.employee_count ?? 0} employees · {data?.missing_count ?? missing.length} not submitted ·{" "}
                {data?.pending_approval_count ?? pending.length} awaiting approval
              </p>
            </div>
          </div>
        </div>

        {showFlagged ? (
          <Section title="Anomalies flagged" icon={AlertTriangle} rows={flagged} tone="warning" />
        ) : (
          <Section title="Not submitted" icon={Clock} rows={missing} tone="destructive" />
        )}

        {!showFlagged && pending.length > 0 && (
          <Section
            title="Pending approval"
            icon={CheckCircle2}
            rows={pending}
            onApprove={approve}
            onReject={reject}
          />
        )}
      </div>

      <div className="shrink-0 border-t border-border bg-background px-4 py-3">
        <button
          type="button"
          onClick={() => void remindMissing()}
          disabled={isRunning || submitting || missing.length === 0}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-navy px-3 text-[13px] font-semibold text-white hover:bg-navy/90 disabled:opacity-50"
        >
          {submitting || isRunning ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Mail className="size-4" />
          )}
          Remind {missing.length || "all"} non-submitters
        </button>
      </div>
    </div>
  )
}

function Section({
  title,
  icon: Icon,
  rows,
  tone = "muted",
  onApprove,
  onReject,
}: {
  title: string
  icon: typeof Users
  rows: TimesheetRow[]
  tone?: "muted" | "warning" | "destructive"
  onApprove?: (row: TimesheetRow) => void
  onReject?: (row: TimesheetRow) => void
}) {
  return (
    <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
      <p className="mb-2 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" />
        {title} ({rows.length})
      </p>
      {rows.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">None in this bucket.</p>
      ) : (
        <ul className="max-h-56 space-y-2 overflow-y-auto text-[12px]">
          {rows.map((row) => (
            <li
              key={`${row.employee_id}-${row.timesheet_id}`}
              className={cn(
                "rounded-lg border px-3 py-2",
                tone === "destructive" && "border-destructive/30 bg-destructive/5",
                tone === "warning" && "border-warning/30 bg-warning/5",
                tone === "muted" && "border-border/70 bg-muted/20",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">
                    {row.name || "Employee"}
                    <span className="font-normal text-muted-foreground"> · {row.department || "—"}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {row.status || "open"}
                    {row.total_hours ? ` · ${row.total_hours}h` : ""}
                    {row.overtime_hours ? ` · OT ${row.overtime_hours}h` : ""}
                  </p>
                  {row.anomalies?.length ? (
                    <p className="mt-1 text-[11px] text-warning">{row.anomalies.join("; ")}</p>
                  ) : null}
                </div>
                {row.timesheet_id && row.status === "submitted" ? (
                  <div className="flex items-center gap-2">
                    {onApprove ? (
                      <button
                        type="button"
                        onClick={() => onApprove(row)}
                        className="rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted"
                      >
                        Approve
                      </button>
                    ) : null}
                    {onReject ? (
                      <button
                        type="button"
                        onClick={() => onReject(row)}
                        className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/10"
                      >
                        Reject
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
