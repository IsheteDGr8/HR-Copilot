"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CheckCircle2, Circle, Loader2, RefreshCw } from "lucide-react"

export type OnboardingChecklistDoc = {
  id?: string
  employeeId?: string
  employee_id?: string
  employee_name?: string
  role?: string
  department?: string
  status?: string
  background_check?: boolean
  profile_setup?: boolean
  email_setup?: boolean
  i9_signed?: boolean
  nda_signed?: boolean | null
  nda_required?: boolean
  emergency_contact?: boolean
  emergency_contact_submitted?: boolean
  training_checklist?: boolean
  checklist_flags?: Record<string, boolean | null>
  [key: string]: unknown
}

type Step = {
  key: string
  label: string
  done: boolean
}

const AUTH_TOKEN_KEY = "auth_token"

function authHeaders(): HeadersInit {
  const token =
    (typeof window !== "undefined" && localStorage.getItem(AUTH_TOKEN_KEY)) || "mock-jwt-token"
  return { Authorization: `Bearer ${token}` }
}

function asBool(value: unknown): boolean {
  return value === true || value === "true" || String(value).toLowerCase() === "completed"
}

function employeeKey(data?: OnboardingChecklistDoc | null): string {
  if (!data) return ""
  return String(data.employeeId || data.employee_id || data.id || "").trim()
}

function stepsFromDoc(data: OnboardingChecklistDoc): Step[] {
  const flags = data.checklist_flags || {}
  const ndaRequired = data.nda_required !== false && flags.nda_required !== false
  const items: Step[] = [
    {
      key: "background_check",
      label: "Background check",
      done: asBool(data.background_check ?? flags.background_check),
    },
    {
      key: "profile_setup",
      label: "Profile setup",
      done: asBool(data.profile_setup ?? flags.profile_setup),
    },
    {
      key: "email_setup",
      label: "Email / licenses setup",
      done: asBool(data.email_setup ?? flags.email_setup),
    },
    {
      key: "i9_signed",
      label: "Form I-9 signed",
      done: asBool(data.i9_signed ?? flags.i9_signed),
    },
  ]
  if (ndaRequired) {
    items.push({
      key: "nda_signed",
      label: "NDA / non-compete signed",
      done: asBool(data.nda_signed ?? flags.nda_signed),
    })
  }
  items.push(
    {
      key: "emergency_contact",
      label: "Emergency contact submitted",
      done: asBool(
        data.emergency_contact ??
          data.emergency_contact_submitted ??
          flags.emergency_contact ??
          flags.emergency_contact_submitted,
      ),
    },
    {
      key: "training_checklist",
      label: "Training checklist",
      done: asBool(data.training_checklist ?? flags.training_checklist),
    },
  )
  return items
}

export function OnboardingTracker({ data }: { data?: OnboardingChecklistDoc | null }) {
  const empId = employeeKey(data)
  const [remote, setRemote] = useState<OnboardingChecklistDoc | null>(null)
  const [loading, setLoading] = useState(false)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!empId) {
      setRemote(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/onboarding/checklists/${encodeURIComponent(empId)}`, {
        headers: authHeaders(),
      })
      if (res.status === 404) {
        setRemote(null)
        setError(null)
        return
      }
      if (!res.ok) {
        throw new Error(`Checklist request failed (${res.status})`)
      }
      const json = (await res.json()) as OnboardingChecklistDoc
      setRemote(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load checklist")
    } finally {
      setLoading(false)
    }
  }, [empId])

  useEffect(() => {
    void load()
  }, [load])

  const toggle = useCallback(
    async (key: string, current: boolean) => {
      if (!empId || savingKey) return
      const next = !current
      const base = remote || data || {}
      // Optimistic flip.
      setRemote({ ...base, [key]: next } as OnboardingChecklistDoc)
      setSavingKey(key)
      setError(null)
      try {
        const res = await fetch(
          `/api/v1/onboarding/checklists/${encodeURIComponent(empId)}`,
          {
            method: "PATCH",
            headers: { ...authHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify({ updates: { [key]: next } }),
          },
        )
        if (!res.ok) throw new Error(`Update failed (${res.status})`)
        const json = (await res.json()) as OnboardingChecklistDoc
        setRemote(json)
      } catch (err) {
        // Revert by reloading authoritative state.
        setError(err instanceof Error ? err.message : "Failed to update checklist")
        void load()
      } finally {
        setSavingKey(null)
      }
    },
    [empId, remote, data, savingKey, load],
  )

  const merged = remote || data || {}
  const steps = useMemo(() => stepsFromDoc(merged), [merged])
  const doneCount = steps.filter((s) => s.done).length
  const pct = steps.length ? Math.round((doneCount / steps.length) * 100) : 0
  const name = String(merged.employee_name || data?.employee_name || "New hire")

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Onboarding tracker
          </p>
          <h3 className="mt-0.5 truncate text-[15px] font-semibold text-foreground">{name}</h3>
          <p className="text-[12px] text-muted-foreground">
            {empId ? `Employee ID ${empId}` : "Not committed yet — preview only"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={!empId || loading}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-white px-2 text-[11px] text-muted-foreground disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </button>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            {doneCount} of {steps.length} complete
          </span>
          <span className="tabular-nums">{pct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-navy">
          <div
            className="h-full rounded-full bg-emerald-400/80 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {steps.map((step) => {
          const saving = savingKey === step.key
          return (
            <li key={step.key}>
              <button
                type="button"
                onClick={() => void toggle(step.key, step.done)}
                disabled={!empId || Boolean(savingKey)}
                title={empId ? "Click to toggle" : "Commit the hire first"}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-white px-3 py-2.5 text-left transition-colors enabled:hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="flex min-w-0 items-center gap-2">
                  {saving ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                  ) : step.done ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-neutral-600" />
                  )}
                  <span className="truncate text-[13px] text-foreground">{step.label}</span>
                </div>
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {step.done ? "Done" : "Pending"}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {empId ? (
        <p className="text-[11px] text-muted-foreground">Click any item to toggle its status.</p>
      ) : null}
      {error ? <p className="text-[12px] text-red-300/90">{error}</p> : null}
    </div>
  )
}

export default OnboardingTracker
