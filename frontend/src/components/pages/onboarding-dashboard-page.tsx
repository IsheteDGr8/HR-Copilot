"use client"

import { useState, useEffect, useCallback } from "react"
import { CheckCircle2, Circle, ChevronDown, ChevronUp, RefreshCw, AlertCircle } from "lucide-react"
import { PageContainer, PageHeader, StatCard } from "@/components/management/shared"

interface ChecklistEmployee {
  employeeId: string
  name: string
  role: string
  department: string
  hireDate: string
  done: string[]
  pending: string[]
}

function daysUntil(hireDate: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const hire = new Date(hireDate)
  hire.setHours(0, 0, 0, 0)
  return Math.round((hire.getTime() - today.getTime()) / 86400000)
}

function startLabel(days: number) {
  if (days === 0) return "Starts today"
  if (days > 0) return `Starts in ${days}d`
  return `Started ${Math.abs(days)}d ago`
}

function getAuthToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem("auth_token")
}

export function OnboardingDashboardPage() {
  const [employees, setEmployees] = useState<ChecklistEmployee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const fetchChecklist = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = getAuthToken()
      const res = await fetch("/api/v1/onboarding/checklist", {
        headers: token ? { Authorization: `Bearer ${token}` } : { Authorization: "Bearer mock-jwt-token" },
        cache: "no-store",
      })
      if (!res.ok) throw new Error(`Server responded ${res.status}`)
      const data = await res.json()
      setEmployees(data.employees || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load checklist")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchChecklist()
  }, [fetchChecklist])

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const total = employees.length
  const fullyDone = employees.filter((r) => r.pending.length === 0).length
  const notStarted = employees.filter((r) => r.done.length === 0).length
  const totalSteps = employees.reduce((sum, r) => sum + r.done.length + r.pending.length, 0)
  const totalDone = employees.reduce((sum, r) => sum + r.done.length, 0)

  return (
    <PageContainer>
      <div className="mb-4 flex items-center justify-between">
        <PageHeader
          title="Checklist"
          description="Every employee currently in progress, with exactly what's done and what's still pending — live from your database."
        />
        <button
          onClick={fetchChecklist}
          disabled={loading}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-[12.5px] font-medium text-foreground transition-colors hover:bg-secondary/60 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3.5 text-[13px] text-red-500">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Couldn&apos;t load live data: {error}. Is the backend running and proxied at /api/v1?
        </div>
      )}

      {!error && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="In Progress" value={total} />
          <StatCard label="Fully Complete" value={fullyDone} />
          <StatCard label="Not Yet Started" value={notStarted} />
          <StatCard label="Steps Completed" value={`${totalDone}/${totalSteps}`} />
        </div>
      )}

      {loading && employees.length === 0 && !error && (
        <p className="text-[13px] text-muted-foreground">Loading live data...</p>
      )}

      {!loading && !error && employees.length === 0 && (
        <p className="text-[13px] text-muted-foreground">No employees currently onboarding.</p>
      )}

      <div className="flex flex-col gap-2">
        {employees.map((r) => {
          const totalR = r.done.length + r.pending.length
          const pct = totalR ? Math.round((r.done.length / totalR) * 100) : 0
          const isOpen = expanded.has(r.employeeId)
          const days = daysUntil(r.hireDate)
          return (
            <div key={r.employeeId} className="rounded-xl border border-border/60 bg-card/40 transition-colors duration-300 hover:border-border">
              <button onClick={() => toggle(r.employeeId)} className="flex w-full items-center gap-4 p-4 text-left">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13.5px] font-medium text-foreground">{r.name}</span>
                    {pct === 100 && (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
                        Ready
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-muted-foreground">
                    {r.role} · {r.department} · {startLabel(days)}
                  </p>
                </div>
                <div className="hidden shrink-0 items-center gap-2 text-[12px] text-muted-foreground sm:flex">
                  <span className="font-medium text-foreground">{r.done.length}</span>
                  done ·
                  <span className="font-medium text-foreground">{r.pending.length}</span>
                  pending
                </div>
                <div className="w-24 shrink-0">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary/60">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: pct === 100 ? "#2E9E7C" : pct >= 40 ? "#F5A623" : "#FF6B4A" }}
                    />
                  </div>
                </div>
                {isOpen ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
              </button>

              {isOpen && (
                <div className="grid grid-cols-1 gap-4 border-t border-border/60 px-4 py-3.5 sm:grid-cols-2">
                  <div>
                    <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Done</p>
                    <div className="flex flex-col gap-1.5">
                      {r.done.length === 0 && <p className="text-[12.5px] text-muted-foreground">Nothing yet</p>}
                      {r.done.map((step) => (
                        <div key={step} className="flex items-center gap-2 text-[12.5px]">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" style={{ color: "#2E9E7C" }} />
                          <span className="text-foreground">{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Pending</p>
                    <div className="flex flex-col gap-1.5">
                      {r.pending.length === 0 && <p className="text-[12.5px] text-muted-foreground">All done</p>}
                      {r.pending.map((step) => (
                        <div key={step} className="flex items-center gap-2 text-[12.5px]">
                          <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="text-foreground">{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </PageContainer>
  )
}
