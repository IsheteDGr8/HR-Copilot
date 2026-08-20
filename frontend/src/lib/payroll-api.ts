"use client"

import { useCallback, useEffect, useState } from "react"
import type { PayrollSummaryData } from "@/components/copilot/modules/PayrollSummary"
import type { TimesheetStatusData } from "@/components/copilot/modules/TimesheetStatus"

const AUTH_TOKEN_KEY = "auth_token"

function authHeaders(): HeadersInit {
  const token =
    (typeof window !== "undefined" && localStorage.getItem(AUTH_TOKEN_KEY)) || "mock-jwt-token"
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
}

export type TimesheetRow = {
  id?: string
  employeeId?: string
  employeeName?: string
  department?: string
  status?: string
  payPeriodId?: string
  totalHours?: number
  overtimeHours?: number
  grossPay?: number
  anomalies?: string[]
}

export async function fetchPayrollTimesheets(params?: {
  pay_period?: string
  department?: string
  status?: string
}) {
  const qs = new URLSearchParams()
  if (params?.pay_period) qs.set("pay_period", params.pay_period)
  if (params?.department) qs.set("department", params.department)
  if (params?.status) qs.set("status", params.status)
  const suffix = qs.toString() ? `?${qs.toString()}` : ""
  const res = await fetch(`/api/v1/payroll/timesheets${suffix}`, { headers: authHeaders() })
  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error(err?.detail || `Failed to load timesheets (${res.status})`)
  }
  return res.json() as Promise<{
    ok: boolean
    pay_period_id: string
    timesheets: TimesheetRow[]
    overview: TimesheetStatusData
  }>
}

export async function fetchPayrollSummary(pay_period?: string) {
  const qs = pay_period ? `?pay_period=${encodeURIComponent(pay_period)}` : ""
  const res = await fetch(`/api/v1/payroll/summary${qs}`, { headers: authHeaders() })
  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error(err?.detail || `Failed to load summary (${res.status})`)
  }
  const data = await res.json()
  return data.summary as PayrollSummaryData
}

export async function fetchPayrollAnomalies(pay_period?: string, department?: string) {
  const qs = new URLSearchParams()
  if (pay_period) qs.set("pay_period", pay_period)
  if (department) qs.set("department", department)
  const suffix = qs.toString() ? `?${qs.toString()}` : ""
  const res = await fetch(`/api/v1/payroll/anomalies${suffix}`, { headers: authHeaders() })
  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error(err?.detail || `Failed to load anomalies (${res.status})`)
  }
  const data = await res.json()
  return data.anomalies as {
    flagged_count?: number
    flagged?: Array<Record<string, unknown>>
    pay_period_id?: string
  }
}

export async function patchTimesheet(
  timesheetId: string,
  action: "approve" | "reject",
  employeeId?: string,
  reason?: string,
) {
  const res = await fetch(`/api/v1/payroll/timesheets/${encodeURIComponent(timesheetId)}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ action, employee_id: employeeId, reason }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error(err?.detail || `Update failed (${res.status})`)
  }
  return res.json()
}

export async function draftTimesheetReminders(body?: {
  pay_period?: string
  department?: string
  subject?: string
  body_template?: string
}) {
  const res = await fetch("/api/v1/payroll/remind", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body || {}),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error(err?.detail || `Reminder draft failed (${res.status})`)
  }
  return res.json()
}

export function usePayroll(payPeriod?: string) {
  const [overview, setOverview] = useState<TimesheetStatusData | null>(null)
  const [timesheets, setTimesheets] = useState<TimesheetRow[]>([])
  const [summary, setSummary] = useState<PayrollSummaryData | null>(null)
  const [anomalies, setAnomalies] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const ts = await fetchPayrollTimesheets({ pay_period: payPeriod })
      setOverview(ts.overview)
      setTimesheets(ts.timesheets)
      setSummary(await fetchPayrollSummary(ts.pay_period_id || payPeriod))
      setAnomalies(await fetchPayrollAnomalies(ts.pay_period_id || payPeriod))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load payroll data")
    } finally {
      setLoading(false)
    }
  }, [payPeriod])

  useEffect(() => {
    void reload()
  }, [reload])

  return {
    overview,
    timesheets,
    summary,
    anomalies,
    loading,
    error,
    reload,
    patchTimesheet,
    draftTimesheetReminders,
  }
}
