"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  Gift,
  Loader2,
  Mail,
  MessageSquare,
  UserRound,
} from "lucide-react"
import { toast } from "sonner"
import { useChat } from "@/lib/chat-store"

export type AssignedBenefit = {
  id?: string
  name?: string
  description?: string
  [key: string]: unknown
}

export type OnboardingWorkflowData = {
  employee_name?: string
  department?: string
  role?: string
  start_date?: string
  assigned_benefits?: AssignedBenefit[]
  drafted_email?: string
  drafted_teams_message?: string
  checklist?: Array<Record<string, unknown>>
  [key: string]: unknown
}

type Props = {
  data?: OnboardingWorkflowData | null
}

function asText(value: unknown, fallback = ""): string {
  if (value == null) return fallback
  const s = String(value).trim()
  return s || fallback
}

function normalizeBenefits(raw: unknown): AssignedBenefit[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => (item && typeof item === "object" ? (item as AssignedBenefit) : null))
    .filter((item): item is AssignedBenefit => Boolean(item))
}

export function OnboardingWorkflow({ data }: Props) {
  const sendMessage = useChat((s) => s.sendMessage)
  const isRunning = useChat((s) => s.isRunning)
  const [submitted, setSubmitted] = useState(false)

  const employeeName = asText(data?.employee_name, "New hire")
  const role = asText(data?.role)
  const department = asText(data?.department)
  const startDate = asText(data?.start_date)
  const draftedEmail = asText(data?.drafted_email)
  const draftedTeams = asText(data?.drafted_teams_message)
  const benefits = useMemo(
    () => normalizeBenefits(data?.assigned_benefits),
    [data?.assigned_benefits],
  )

  const loading = !data
  const hasPacketContent = Boolean(draftedEmail || draftedTeams || benefits.length > 0)

  useEffect(() => {
    setSubmitted(false)
  }, [data])

  const confirmProvision = async () => {
    const message =
      `[PROVISIONING APPROVED] Execute IT provisioning and send Welcome Email for ${employeeName}.`
    setSubmitted(true)
    try {
      await sendMessage(message)
      toast.success("Provisioning approval sent")
    } catch (err) {
      setSubmitted(false)
      toast.error(err instanceof Error ? err.message : "Failed to submit approval")
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-5 pb-24">
        {/* Header */}
        <header className="rounded-xl border border-white/[0.08] bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-neutral-200">
              <UserRound className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                Onboarding packet
              </p>
              <h2 className="mt-0.5 truncate text-[16px] font-semibold text-neutral-50">
                {loading ? "Loading…" : employeeName}
              </h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <MetaChip
                  icon={<Building2 className="h-3.5 w-3.5" />}
                  label="Role"
                  value={role || (loading ? "—" : "Pending")}
                />
                <MetaChip
                  icon={<Building2 className="h-3.5 w-3.5" />}
                  label="Department"
                  value={department || (loading ? "—" : "Pending")}
                />
                <MetaChip
                  icon={<CalendarDays className="h-3.5 w-3.5" />}
                  label="Start date"
                  value={startDate || (loading ? "—" : "Pending")}
                />
              </div>
            </div>
          </div>
        </header>

        {/* Section 1 — Benefits */}
        <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
          <SectionTitle
            icon={<Gift className="h-4 w-4" />}
            title="Assigned benefits"
            subtitle="Eligibility matched from role, department, and salary"
          />
          {loading ? (
            <EmptyHint>Loading benefits…</EmptyHint>
          ) : benefits.length === 0 ? (
            <EmptyHint>No benefits assigned yet. Complete packet prep to populate this list.</EmptyHint>
          ) : (
            <ul className="mt-3 flex flex-col gap-2.5">
              {benefits.map((benefit, index) => {
                const name = asText(benefit.name, `Benefit ${index + 1}`)
                const description = asText(benefit.description)
                const key = asText(benefit.id, name)
                return (
                  <li
                    key={key}
                    className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-md border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
                        {name}
                      </span>
                    </div>
                    {description ? (
                      <p className="mt-1.5 text-[12.5px] leading-relaxed text-neutral-300">
                        {description}
                      </p>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* Section 2 — Welcome email */}
        <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
          <SectionTitle
            icon={<Mail className="h-4 w-4" />}
            title="Welcome email"
            subtitle="Read-only draft for HR review"
          />
          {loading ? (
            <EmptyHint>Loading email draft…</EmptyHint>
          ) : draftedEmail ? (
            <div className="mt-3 overflow-hidden rounded-lg border border-white/[0.08] bg-black/30">
              <div className="border-b border-white/[0.06] px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                Draft message
              </div>
              <textarea
                readOnly
                value={draftedEmail}
                rows={12}
                className="block w-full resize-none bg-transparent px-3 py-3 font-mono text-[12px] leading-relaxed text-neutral-200 outline-none"
              />
            </div>
          ) : (
            <EmptyHint>No welcome email draft yet.</EmptyHint>
          )}
        </section>

        {/* Section 3 — IT / Teams */}
        <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
          <SectionTitle
            icon={<MessageSquare className="h-4 w-4" />}
            title="IT provisioning"
            subtitle="Teams message for IT"
          />
          {loading ? (
            <EmptyHint>Loading IT message…</EmptyHint>
          ) : draftedTeams ? (
            <div className="mt-3 rounded-lg border border-sky-500/20 bg-sky-500/[0.06] px-3 py-3">
              <pre className="whitespace-pre-wrap break-words font-sans text-[12.5px] leading-relaxed text-neutral-200">
                {draftedTeams}
              </pre>
            </div>
          ) : (
            <EmptyHint>No IT provisioning message yet.</EmptyHint>
          )}
        </section>

        {!loading && !hasPacketContent ? (
          <p className="text-center text-[12px] text-neutral-500">
            Waiting for the agent to prepare the onboarding packet…
          </p>
        ) : null}
      </div>

      {/* Sticky action bar */}
      <div className="sticky bottom-0 z-10 -mx-1 border-t border-white/[0.08] bg-[#0c0c0e]/95 px-1 py-3 backdrop-blur-md">
        {submitted ? (
          <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2.5 text-[12.5px] text-neutral-100">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
            Provisioning approved. Waiting for the agent to continue.
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void confirmProvision()}
            disabled={isRunning || loading || !employeeName}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white px-3 text-[13px] font-semibold text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Confirm &amp; Provision
          </button>
        )}
      </div>
    </div>
  )
}

function SectionTitle({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode
  title: string
  subtitle: string
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-neutral-300">
        {icon}
      </span>
      <div className="min-w-0">
        <h3 className="text-[13.5px] font-semibold text-neutral-100">{title}</h3>
        <p className="text-[11.5px] text-neutral-500">{subtitle}</p>
      </div>
    </div>
  )
}

function MetaChip({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
        {icon}
        {label}
      </div>
      <p className="mt-1 truncate text-[12.5px] font-medium text-neutral-100">{value}</p>
    </div>
  )
}

function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-[12.5px] leading-relaxed text-neutral-500">{children}</p>
}

export default OnboardingWorkflow
