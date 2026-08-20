"use client"

import { useMemo } from "react"
import { Building2, DollarSign, TrendingUp } from "lucide-react"

export type PayrollSummaryData = {
  pay_period_id?: string
  employee_count?: number
  submitted_count?: number
  missing_count?: number
  total_gross?: number
  total_net?: number
  total_overtime?: number
  by_department?: Record<
    string,
    { department?: string; employee_count?: number; gross?: number; overtime_hours?: number }
  >
  exceptions?: Array<{
    employee_name?: string
    department?: string
    anomalies?: string[]
    timesheet_id?: string
  }>
  [key: string]: unknown
}

type Props = {
  data?: PayrollSummaryData | null
}

export function PayrollSummary({ data }: Props) {
  const depts = useMemo(() => Object.values(data?.by_department || {}), [data])
  const exceptions = useMemo(() => data?.exceptions ?? [], [data])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <p className="text-[15px] font-semibold text-foreground">
            Payroll run — {data?.pay_period_id || "Current period"}
          </p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {data?.employee_count ?? 0} employees · {data?.missing_count ?? 0} missing submissions
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            label="Gross payroll"
            value={`$${Number(data?.total_gross || 0).toLocaleString()}`}
            icon={DollarSign}
          />
          <Stat
            label="Net (est.)"
            value={`$${Number(data?.total_net || 0).toLocaleString()}`}
            icon={TrendingUp}
          />
          <Stat
            label="Overtime hours"
            value={String(Number(data?.total_overtime || 0).toFixed(1))}
            icon={Building2}
          />
        </div>

        <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <p className="mb-2 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
            By department
          </p>
          <ul className="space-y-2 text-[12px]">
            {depts.map((d) => (
              <li key={d.department} className="flex justify-between rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                <span className="font-medium">{d.department || "Unknown"}</span>
                <span className="text-muted-foreground">
                  {d.employee_count ?? 0} · ${Number(d.gross || 0).toLocaleString()}
                </span>
              </li>
            ))}
            {depts.length === 0 && <li className="text-muted-foreground">No department breakdown.</li>}
          </ul>
        </div>

        {exceptions.length > 0 && (
          <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 shadow-sm">
            <p className="mb-2 text-[10.5px] font-medium uppercase tracking-wide text-warning">
              Exceptions ({exceptions.length})
            </p>
            <ul className="space-y-2 text-[12px]">
              {exceptions.map((ex) => (
                <li key={ex.timesheet_id || ex.employee_name} className="rounded-lg border border-warning/20 bg-white/60 px-3 py-2">
                  <p className="font-medium">{ex.employee_name} · {ex.department}</p>
                  <p className="text-[11px] text-muted-foreground">{ex.anomalies?.join("; ")}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: typeof DollarSign
}) {
  return (
    <div className="rounded-xl border border-border bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-3.5" />
        <p className="text-[10px] font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  )
}
