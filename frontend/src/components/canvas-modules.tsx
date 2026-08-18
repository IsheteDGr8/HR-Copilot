"use client"

import {
  Briefcase,
  Building2,
  CalendarDays,
  CheckCircle2,
  DollarSign,
  FileText,
  Mail,
  MapPin,
  MessageSquare,
  Send,
  Shield,
  User,
  Users,
  X,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"
import { useCanvas, type CanvasArtifact } from "@/lib/canvas-store"
import { HR_ACTION_KIND, type HrActionKind } from "@/lib/hr-actions"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Shared presentational helpers
// ---------------------------------------------------------------------------
function initials(name: string): string {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("")
}

function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border border-black/10 bg-black/[0.05] font-semibold text-neutral-700",
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}

function Field({
  icon: Icon,
  label,
  value,
}: {
  icon?: React.ComponentType<{ className?: string }>
  label: string
  value?: React.ReactNode
}) {
  if (value == null || value === "") return null
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wide text-neutral-600">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </span>
      <span className="text-[13px] text-neutral-800">{value}</span>
    </div>
  )
}

function CardTitle({
  title,
  subtitle,
  name,
}: {
  title: string
  subtitle?: string
  name?: string
}) {
  return (
    <div className="flex items-center gap-3">
      {name && <Avatar name={name} className="h-11 w-11 text-[14px]" />}
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold text-neutral-900">{title}</p>
        {subtitle && <p className="truncate text-[12.5px] text-neutral-600">{subtitle}</p>}
      </div>
    </div>
  )
}

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-black/[0.08] bg-black/[0.02] p-4",
        className,
      )}
    >
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Module renderers (keyed by tool result shape)
// ---------------------------------------------------------------------------
function formatSalary(amount: unknown, currency?: string, frequency?: string): string | undefined {
  if (amount == null || amount === "") return undefined
  const n = Number(amount)
  if (!Number.isFinite(n)) return String(amount)
  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 0,
  }).format(n)
  return frequency ? `${money} / ${frequency}` : money
}

function EmployeeProfile({ data }: { data: any }) {
  const e = data?.employee ?? {}
  const salary = formatSalary(e.salary, e.currency, e.pay_frequency)
  return (
    <div className="flex flex-col gap-3">
      <Panel>
        <CardTitle title={e.name} subtitle={e.title} name={e.name} />
      </Panel>
      <Panel>
        <div className="grid grid-cols-2 gap-x-4 gap-y-4">
          <Field icon={Building2} label="Department" value={e.department} />
          <Field icon={Briefcase} label="Employment" value={e.employment_type} />
          <Field icon={User} label="Manager" value={e.manager || "—"} />
          <Field icon={MapPin} label="Location" value={e.location} />
          <Field icon={Mail} label="Email" value={e.email} />
          <Field icon={CalendarDays} label="Start date" value={e.start_date} />
          <Field label="Employee ID" value={e.id} />
          {salary && <Field icon={DollarSign} label="Salary" value={salary} />}
        </div>
      </Panel>
    </div>
  )
}

function Pto({ data }: { data: any }) {
  const e = data?.employee ?? {}
  const pto = data?.pto ?? {}
  const total = Number(pto.accrual_days_per_year) || 0
  const used = Number(pto.used_days) || 0
  const remaining = Number(pto.remaining_days) ?? Math.max(0, total - used)
  const usedPct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0

  return (
    <div className="flex flex-col gap-3">
      <Panel>
        <CardTitle title={e.name} subtitle="Paid time off" name={e.name} />
      </Panel>
      <Panel>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Remaining", value: remaining, strong: true },
            { label: "Used", value: used },
            { label: "Annual", value: total },
          ].map((m) => (
            <div key={m.label} className="flex flex-col items-center gap-0.5 rounded-lg bg-black/[0.03] py-3">
              <span
                className={cn(
                  "text-[22px] font-semibold tabular-nums",
                  m.strong ? "text-neutral-900" : "text-neutral-600",
                )}
              >
                {m.value}
              </span>
              <span className="text-[10.5px] uppercase tracking-wide text-neutral-600">{m.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-neutral-600">
            <span>{used} used</span>
            <span>{usedPct}% of {total} days</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-black/[0.05]">
            <div
              className="h-full rounded-full bg-neutral-600 transition-all"
              style={{ width: `${usedPct}%` }}
            />
          </div>
        </div>
        {pto.as_of && (
          <p className="mt-3 text-[11px] text-neutral-600">As of {pto.as_of}</p>
        )}
      </Panel>
    </div>
  )
}

function OrgChart({ data }: { data: any }) {
  const e = data?.employee ?? {}
  const peers: any[] = Array.isArray(data?.peers) ? data.peers : []
  const reports: any[] = Array.isArray(data?.reports) ? data.reports : []

  const PersonRow = ({ p }: { p: any }) => (
    <div className="flex items-center gap-2.5 rounded-lg border border-black/[0.08] bg-black/[0.02] px-3 py-2">
      <Avatar name={p.name} className="h-7 w-7 text-[11px]" />
      <div className="min-w-0">
        <p className="truncate text-[13px] text-neutral-800">{p.name}</p>
        {p.title && <p className="truncate text-[11px] text-neutral-600">{p.title}</p>}
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      {data?.manager && (
        <div>
          <p className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wide text-neutral-600">Reports to</p>
          <PersonRow p={{ name: data.manager }} />
        </div>
      )}

      <Panel className="border-black/12 bg-black/[0.05]">
        <div className="flex items-center gap-3">
          <Avatar name={e.name} className="h-10 w-10 text-[13px]" />
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-neutral-900">{e.name}</p>
            {e.title && <p className="truncate text-[12px] text-neutral-600">{e.title}</p>}
          </div>
        </div>
      </Panel>

      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wide text-neutral-600">
          <Users className="h-3 w-3" /> Direct reports ({reports.length})
        </p>
        <div className="flex flex-col gap-1.5">
          {reports.length > 0 ? (
            reports.map((r, i) => <PersonRow key={i} p={r} />)
          ) : (
            <p className="rounded-lg border border-dashed border-black/[0.1] px-3 py-2 text-[12px] text-neutral-600">
              No direct reports
            </p>
          )}
        </div>
      </div>

      {peers.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wide text-neutral-600">
            Peers ({peers.length})
          </p>
          <div className="flex flex-col gap-1.5">
            {peers.map((p, i) => (
              <PersonRow key={i} p={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Benefits({ data }: { data: any }) {
  const e = data?.employee ?? {}
  const b = data?.benefits ?? {}
  return (
    <div className="flex flex-col gap-3">
      <Panel>
        <CardTitle title={e.name} subtitle="Benefits enrollment" name={e.name} />
      </Panel>
      <Panel>
        <div className="flex flex-col gap-4">
          <Field icon={Shield} label="Medical" value={b.medical} />
          <Field icon={Shield} label="Dental" value={b.dental} />
          <Field icon={Shield} label="Vision" value={b.vision} />
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="401(k) contribution"
              value={b.retirement_401k_percent != null ? `${b.retirement_401k_percent}%` : undefined}
            />
            <Field
              label="Employer match"
              value={b.employer_match_percent != null ? `${b.employer_match_percent}%` : undefined}
            />
          </div>
        </div>
      </Panel>
    </div>
  )
}

function Policy({ data }: { data: any }) {
  const results: any[] = Array.isArray(data?.results) ? data.results : []
  return (
    <div className="flex flex-col gap-3">
      {data?.query && (
        <p className="text-[12px] text-neutral-600">
          Results for <span className="text-neutral-600">“{data.query}”</span>
        </p>
      )}
      {results.map((r, i) => (
        <Panel key={i}>
          <div className="flex items-start gap-2">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-neutral-600" />
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold text-neutral-900">{r.title}</p>
              {r.section && <p className="text-[11.5px] text-neutral-600">{r.section}</p>}
            </div>
          </div>
          {r.snippet && (
            <p className="mt-2.5 text-[12.5px] leading-relaxed text-neutral-600">{r.snippet}</p>
          )}
          {r.source && (
            <p className="mt-2.5 border-t border-black/[0.08] pt-2 text-[11px] text-neutral-600">
              Source: {r.source}
            </p>
          )}
        </Panel>
      ))}
    </div>
  )
}

const ACTION_ICON: Record<HrActionKind, React.ComponentType<{ className?: string }>> = {
  email: Mail,
  slack: MessageSquare,
  teams: MessageSquare,
}

function ActionApproval({ artifact }: { artifact: CanvasArtifact }) {
  const resolveApproval = useCanvas((s) => s.resolveApproval)
  const action = artifact.action
  if (!action) return null

  const kind = HR_ACTION_KIND[action.toolName] ?? "email"
  const Icon = ACTION_ICON[kind]
  const p = action.params ?? {}
  const pending = action.status === "pending"

  // Recipient/subject rows differ per channel; the body is common.
  const rows: Array<{ label: string; value?: string }> =
    kind === "email"
      ? [
          { label: "To", value: p.to },
          { label: "Cc", value: p.cc },
          { label: "Subject", value: p.subject },
        ]
      : kind === "slack"
        ? [{ label: "Channel", value: p.channel }]
        : [{ label: "Recipient", value: p.recipient }]

  const body: string = kind === "email" ? p.body : p.message

  const approve = () => {
    resolveApproval(artifact.id, "approved")
    toast.success("Approved & sent", { description: artifact.title })
  }
  const reject = () => {
    resolveApproval(artifact.id, "rejected")
    toast("Discarded", { description: "Nothing was sent." })
  }

  return (
    <div className="flex flex-col gap-3">
      <Panel className="border-black/10 bg-black/[0.04]">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-black/10 bg-black/[0.05]">
            <Icon className="h-4 w-4 text-neutral-700" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-neutral-900">{artifact.title}</p>
            <p className="text-[11.5px] text-neutral-600">Awaiting your approval before sending</p>
          </div>
        </div>
      </Panel>

      <Panel>
        <div className="flex flex-col gap-3">
          {rows.map(
            (r) =>
              r.value && (
                <div key={r.label} className="flex flex-col gap-0.5">
                  <span className="text-[10.5px] font-medium uppercase tracking-wide text-neutral-600">
                    {r.label}
                  </span>
                  <span className="text-[13px] text-neutral-800">{r.value}</span>
                </div>
              ),
          )}
          {body && (
            <div className="flex flex-col gap-1">
              <span className="text-[10.5px] font-medium uppercase tracking-wide text-neutral-600">
                Message
              </span>
              <div className="whitespace-pre-wrap rounded-lg border border-black/[0.08] bg-neutral-100 p-3 text-[13px] leading-relaxed text-neutral-700">
                {body}
              </div>
            </div>
          )}
        </div>
      </Panel>

      {pending ? (
        <div className="flex items-center gap-2">
          <button
            onClick={approve}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-black/12 bg-black/[0.08] px-3 py-2.5 text-[13px] font-semibold text-neutral-900 transition-colors hover:bg-black/[0.12]"
          >
            <Send className="h-4 w-4" />
            Approve &amp; Send
          </button>
          <button
            onClick={reject}
            className="flex items-center justify-center gap-2 rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2.5 text-[13px] font-medium text-neutral-600 transition-colors hover:bg-black/[0.05]"
          >
            <X className="h-4 w-4" />
            Reject
          </button>
        </div>
      ) : (
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-[12.5px]",
            action.status === "approved"
              ? "border-black/12 bg-black/[0.05] text-neutral-800"
              : "border-black/10 bg-black/[0.02] text-neutral-600",
          )}
        >
          {action.status === "approved" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{action.result}</span>
        </div>
      )}
    </div>
  )
}

function OnboardingChecklist({ data }: { data: any }) {
  const items: any[] = Array.isArray(data?.checklist) ? data.checklist : []
  return (
    <div className="flex flex-col gap-3">
      <Panel>
        <CardTitle
          title={data?.employee_name || "New hire"}
          subtitle={[data?.role, data?.department].filter(Boolean).join(" · ")}
          name={data?.employee_name}
        />
      </Panel>
      <Panel>
        <div className="mb-3 flex items-center justify-between text-[11px] text-neutral-600">
          <span>Employee ID</span>
          <span className="font-mono text-neutral-600">{data?.employee_id || "—"}</span>
        </div>
        <div className="flex flex-col gap-2">
          {items.length === 0 ? (
            <p className="text-[12px] text-neutral-600">No checklist items</p>
          ) : (
            items.map((item) => {
              const done = String(item.status || "").toLowerCase() === "completed"
              return (
                <div
                  key={item.key || item.label}
                  className="flex items-center justify-between gap-3 rounded-lg border border-black/[0.08] bg-black/[0.02] px-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {done ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-neutral-700" />
                    ) : (
                      <span className="h-4 w-4 shrink-0 rounded-full border border-black/15" />
                    )}
                    <span className="truncate text-[13px] text-neutral-800">
                      {item.label || item.key}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 text-[11px] font-medium uppercase tracking-wide",
                      done ? "text-neutral-700" : "text-neutral-600",
                    )}
                  >
                    {item.status || "Pending"}
                  </span>
                </div>
              )
            })
          )}
        </div>
      </Panel>
    </div>
  )
}

function DocumentCreation({ data }: { data: any }) {
  const doc = data?.document || data?.content || data
  const sections: any[] = Array.isArray(doc?.sections) ? doc.sections : []
  return (
    <div className="flex flex-col gap-3">
      <Panel>
        <CardTitle
          title={doc?.title || `Offer letter — ${data?.candidate_name || "Candidate"}`}
          subtitle={doc?.status || data?.status || "draft"}
        />
      </Panel>
      <Panel>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Candidate" value={data?.candidate_name || doc?.candidate_name} />
          <Field
            label="Salary"
            value={doc?.salary_display || (data?.salary != null ? `$${Number(data.salary).toLocaleString()} USD / year` : undefined)}
          />
          <Field label="Start date" value={data?.start_date || doc?.start_date} />
          <Field label="Document ID" value={data?.document_id} />
        </div>
      </Panel>
      {sections.map((section, i) => (
        <Panel key={i}>
          {section.heading && (
            <p className="mb-2 text-[12px] font-semibold text-neutral-800">{section.heading}</p>
          )}
          {section.body && (
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-neutral-600">
              {section.body}
            </p>
          )}
        </Panel>
      ))}
    </div>
  )
}

function JsonFallback({ data }: { data: any }) {
  return (
    <Panel className="p-3">
      <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed text-neutral-600">
        {JSON.stringify(data, null, 2)}
      </pre>
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------
export function CanvasModuleRenderer({ artifact }: { artifact: CanvasArtifact }) {
  switch (artifact.module) {
    case "employee_profile":
      return <EmployeeProfile data={artifact.data} />
    case "pto":
      return <Pto data={artifact.data} />
    case "org_chart":
      return <OrgChart data={artifact.data} />
    case "benefits":
      return <Benefits data={artifact.data} />
    case "policy":
      return <Policy data={artifact.data} />
    case "action_approval":
      return <ActionApproval artifact={artifact} />
    case "onboarding_checklist":
      return <OnboardingChecklist data={artifact.data} />
    case "document_creation":
      return <DocumentCreation data={artifact.data} />
    default:
      return <JsonFallback data={artifact.data} />
  }
}

export const MODULE_LABEL: Record<CanvasArtifact["module"], string> = {
  employee_profile: "Profile",
  pto: "PTO",
  org_chart: "Org chart",
  benefits: "Benefits",
  policy: "Policy",
  action_approval: "Action",
  onboarding_checklist: "Onboarding",
  document_creation: "Document",
  json: "Data",
}
