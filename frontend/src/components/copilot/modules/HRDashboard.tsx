"use client"

import { useCallback, useEffect, useState } from "react"
import {
  ClipboardList,
  Loader2,
  RefreshCw,
  Ticket,
  UserPlus,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type DashboardSummary = {
  incomplete_onboarding?: number
  open_tickets?: number
  active_applicants?: number
  generated_at?: string
  [key: string]: unknown
}

type Props = {
  data?: DashboardSummary | null
}

const AUTH_TOKEN_KEY = "auth_token"

function authHeaders(): HeadersInit {
  const token =
    (typeof window !== "undefined" && localStorage.getItem(AUTH_TOKEN_KEY)) || "mock-jwt-token"
  return { Authorization: `Bearer ${token}` }
}

type Metric = {
  key: keyof DashboardSummary
  label: string
  hint: string
  icon: typeof ClipboardList
  accent: string
}

const METRICS: Metric[] = [
  {
    key: "incomplete_onboarding",
    label: "Incomplete onboarding",
    hint: "Profile or IT provisioning still open",
    icon: UserPlus,
    accent: "from-sky-50 to-white text-sky-800",
  },
  {
    key: "open_tickets",
    label: "Open / pending tickets",
    hint: "Helpdesk items needing attention",
    icon: Ticket,
    accent: "from-amber-50 to-white text-amber-800",
  },
  {
    key: "active_applicants",
    label: "Active applicants",
    hint: "Shortlisted or interviewing",
    icon: Users,
    accent: "from-emerald-50 to-white text-emerald-800",
  },
]

export function HRDashboard({ data }: Props) {
  const [summary, setSummary] = useState<DashboardSummary>(data || {})
  const [loading, setLoading] = useState(!data)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/v1/dashboard/summary", { headers: authHeaders() })
      if (!res.ok) throw new Error(`Failed to load dashboard (${res.status})`)
      const json = (await res.json()) as DashboardSummary
      setSummary(json)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to load dashboard")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (data && Object.keys(data).length > 0) {
      setSummary(data)
      setLoading(false)
      return
    }
    void refresh()
  }, [data, refresh])

  const total =
    Number(summary.incomplete_onboarding || 0) +
    Number(summary.open_tickets || 0) +
    Number(summary.active_applicants || 0)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <header className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Global HR dashboard
              </p>
              <h2 className="mt-1 text-[16px] font-semibold text-foreground">What&apos;s on your plate</h2>
              <p className="mt-1 text-[12.5px] text-muted-foreground">
                {loading
                  ? "Refreshing live counts…"
                  : `${total} open item${total === 1 ? "" : "s"} across onboarding, helpdesk, and ATS.`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-secondary disabled:opacity-50"
              aria-label="Refresh dashboard"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-3">
          {METRICS.map((m) => {
            const Icon = m.icon
            const value = Number(summary[m.key] ?? 0)
            return (
              <Card
                key={m.key}
                className={cn(
                  "gap-3 border-border bg-gradient-to-br py-4 shadow-sm",
                  m.accent,
                )}
              >
                <CardHeader className="px-4 pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-[13px] font-medium text-foreground">
                      {m.label}
                    </CardTitle>
                    <Icon className="h-4 w-4 opacity-80" />
                  </div>
                  <CardDescription className="text-[11.5px] text-muted-foreground">
                    {m.hint}
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-4 pt-0">
                  <p className="text-[28px] font-semibold tabular-nums tracking-tight text-foreground">
                    {loading ? "—" : value}
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <div className="rounded-xl border border-border bg-white px-4 py-3 text-[12px] text-muted-foreground shadow-sm">
          <ClipboardList className="mr-1.5 inline h-3.5 w-3.5 text-muted-foreground" />
          Counts come from Cosmos: incomplete checklists, Open/Pending tickets, and Shortlisted /
          Interviewing applicants.
          {summary.generated_at ? (
            <span className="mt-1 block text-[11px] text-muted-foreground">
              Updated {new Date(String(summary.generated_at)).toLocaleString()}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
