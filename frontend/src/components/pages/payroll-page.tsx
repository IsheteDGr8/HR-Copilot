"use client"

import { useState } from "react"
import { AlertTriangle, CheckCircle2, Clock, Loader2, Mail } from "lucide-react"
import { toast } from "sonner"
import { PageContainer, PageHeader } from "@/components/management/shared"
import { PayrollSummary } from "@/components/copilot/modules/PayrollSummary"
import { TimesheetStatus } from "@/components/copilot/modules/TimesheetStatus"
import { useChat } from "@/lib/chat-store"
import { patchTimesheet, usePayroll } from "@/lib/payroll-api"
import { cn } from "@/lib/utils"

type Tab = "status" | "summary" | "anomalies"

const tabs: { key: Tab; label: string; icon: typeof Clock }[] = [
  { key: "status", label: "Timesheet status", icon: Clock },
  { key: "summary", label: "Payroll run", icon: CheckCircle2 },
  { key: "anomalies", label: "Anomalies", icon: AlertTriangle },
]

export default function PayrollPage() {
  const [tab, setTab] = useState<Tab>("status")
  const sendMessage = useChat((s) => s.sendMessage)
  const isRunning = useChat((s) => s.isRunning)
  const { overview, summary, anomalies, loading, error, reload } = usePayroll()

  const remind = async () => {
    const period = overview?.pay_period_id || "current period"
    try {
      await sendMessage(`Draft a timesheet reminder for everyone who hasn't submitted for ${period}.`)
      toast.success("Reminder draft started in chat")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start reminder")
    }
  }

  const approve = async (timesheetId: string, employeeId?: string) => {
    try {
      await patchTimesheet(timesheetId, "approve", employeeId)
      toast.success("Timesheet approved")
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approve failed")
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Payroll & Timesheets"
        icon={Clock}
        description="Track submissions, close payroll, and chase missing hours across every employee."
        action={
          <button
            type="button"
            onClick={() => void remind()}
            disabled={isRunning || !overview?.missing_count}
            className="inline-flex items-center gap-2 rounded-lg bg-navy px-3 py-2 text-xs font-semibold text-white hover:bg-navy/90 disabled:opacity-50"
          >
            {isRunning ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />}
            Remind {overview?.missing_count ?? 0} non-submitters
          </button>
        }
      />

      <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-card p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground",
              tab === t.key && "bg-secondary font-semibold text-foreground",
            )}
          >
            <t.icon className="size-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading payroll data…
        </div>
      )}

      {error && !loading && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="mt-4 min-h-[480px] overflow-hidden rounded-xl border border-border bg-card">
          {tab === "status" && overview && (
            <TimesheetStatus
              data={{
                ...overview,
                pending_approval: overview.pending_approval?.map((row) => ({
                  ...row,
                  onApprove: undefined,
                })),
              }}
            />
          )}
          {tab === "summary" && summary && <PayrollSummary data={summary} />}
          {tab === "anomalies" && (
            <TimesheetStatus
              data={{
                pay_period_id: String(anomalies?.pay_period_id || overview?.pay_period_id || ""),
                flagged: anomalies?.flagged as Array<Record<string, unknown>> | undefined,
                flagged_count: Number(anomalies?.flagged_count || 0),
                missing: [],
                missing_count: 0,
                title: "Timesheet anomalies",
              }}
            />
          )}
        </div>
      )}

      {!loading && !error && tab === "status" && overview?.pending_approval?.length ? (
        <div className="mt-4 rounded-xl border border-border bg-card p-4">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Quick approve</p>
          <ul className="space-y-2 text-sm">
            {overview.pending_approval.map((row) => (
              <li key={row.timesheet_id || row.employee_id} className="flex items-center justify-between gap-2">
                <span>{row.name} · {row.department}</span>
                {row.timesheet_id ? (
                  <button
                    type="button"
                    onClick={() => void approve(row.timesheet_id!, row.employee_id)}
                    className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted"
                  >
                    Approve
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </PageContainer>
  )
}
