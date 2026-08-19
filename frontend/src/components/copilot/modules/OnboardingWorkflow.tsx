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
import { OnboardingTracker } from "@/components/copilot/modules/OnboardingTracker"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
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
  email_1_welcome?: string
  email_2_action?: string
  it_tickets?: string
  drafted_teams_message?: string
  drafted_email?: string
  checklist_flags?: Record<string, boolean | null>
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

  const email1 = asText(data?.email_1_welcome || data?.drafted_email)
  const email2 = asText(data?.email_2_action)
  const itTickets = asText(data?.it_tickets || data?.drafted_teams_message)

  const benefits = useMemo(
    () => normalizeBenefits(data?.assigned_benefits),
    [data?.assigned_benefits],
  )

  const loading = !data
  const hasPacketContent = Boolean(email1 || email2 || itTickets || benefits.length > 0)

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
        <header className="rounded-xl border border-border bg-gradient-to-br from-white to-secondary p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-foreground">
              <UserRound className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Onboarding packet
              </p>
              <h2 className="mt-0.5 truncate text-[16px] font-semibold text-foreground">
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

        <section className="rounded-xl border border-border bg-white p-4">
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
                      <span className="inline-flex rounded-md border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                        {name}
                      </span>
                    </div>
                    {description ? (
                      <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                        {description}
                      </p>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-border bg-white px-4">
          <Accordion
            type="multiple"
            defaultValue={["email1"]}
            className="[&_[data-slot=accordion-item]]:border-border"
          >
            <DraftAccordionItem
              value="email1"
              icon={<Mail className="h-4 w-4" />}
              title="Email 1 — Welcome & Week 1 checklist"
              subtitle="Welcome note, Week 1 checklist, and required documents"
              value_text={email1}
              loading={loading}
              empty="No welcome email draft yet."
              rows={14}
            />
            <DraftAccordionItem
              value="email2"
              icon={<Mail className="h-4 w-4" />}
              title="Email 2 — IT / manager notification"
              subtitle="Provisioning request for email, laptop, SSO, and badge"
              value_text={email2}
              loading={loading}
              empty="No IT/manager notification draft yet."
              rows={14}
            />
            <DraftAccordionItem
              value="it"
              icon={<MessageSquare className="h-4 w-4" />}
              title="IT tickets"
              subtitle="Email/licenses, hardware, ID card"
              value_text={itTickets}
              loading={loading}
              empty="No IT ticket payload yet."
              rows={14}
            />
          </Accordion>
        </section>

        {!loading && !hasPacketContent ? (
          <p className="text-center text-[12px] text-muted-foreground">
            Waiting for the agent to prepare the onboarding packet…
          </p>
        ) : null}

        <section className="rounded-xl border border-border bg-white p-4">
          <OnboardingTracker
            data={{
              ...(data || {}),
              employeeId: String(
                (data as { employeeId?: string; employee_id?: string } | null | undefined)
                  ?.employeeId ||
                  (data as { employee_id?: string } | null | undefined)?.employee_id ||
                  "",
              ),
              checklist_flags: data?.checklist_flags,
            }}
          />
        </section>
      </div>

      <div className="sticky bottom-0 z-10 -mx-1 border-t border-border bg-background/95 px-1 py-3 backdrop-blur-md">
        {submitted ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2.5 text-[12.5px] text-foreground">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            Provisioning approved. Waiting for the agent to continue.
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void confirmProvision()}
            disabled={isRunning || loading || !employeeName}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-navy px-3 text-[13px] font-semibold text-white transition hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Confirm &amp; Provision
          </button>
        )}
      </div>
    </div>
  )
}

function DraftAccordionItem({
  value,
  icon,
  title,
  subtitle,
  value_text,
  loading,
  empty,
  rows,
}: {
  value: string
  icon: ReactNode
  title: string
  subtitle: string
  value_text: string
  loading: boolean
  empty: string
  rows: number
}) {
  const hasContent = Boolean(value_text)
  return (
    <AccordionItem value={value}>
      <AccordionTrigger className="hover:no-underline">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-white text-muted-foreground">
            {icon}
          </span>
          <div className="min-w-0 text-left">
            <span className="block text-[13.5px] font-semibold text-foreground">{title}</span>
            <span className="block text-[11.5px] font-normal text-muted-foreground">{subtitle}</span>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        {loading ? (
          <EmptyHint>Loading draft…</EmptyHint>
        ) : hasContent ? (
          <div className="overflow-hidden rounded-lg border border-border bg-muted/50">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Read-only draft
              </span>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(value_text)
                  toast.success("Copied to clipboard")
                }}
                className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Copy
              </button>
            </div>
            <textarea
              readOnly
              value={value_text}
              rows={rows}
              className="block w-full resize-none bg-transparent px-3 py-3 font-mono text-[12px] leading-relaxed text-foreground outline-none"
            />
          </div>
        ) : (
          <EmptyHint>{empty}</EmptyHint>
        )}
      </AccordionContent>
    </AccordionItem>
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
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-white text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0">
        <h3 className="text-[13.5px] font-semibold text-foreground">{title}</h3>
        <p className="text-[11.5px] text-muted-foreground">{subtitle}</p>
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
    <div className="rounded-lg border border-border bg-secondary px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-1 truncate text-[12.5px] font-medium text-foreground">{value}</p>
    </div>
  )
}

function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">{children}</p>
}

export default OnboardingWorkflow
