"use client"

import { useEffect, useState } from "react"
import {
  Briefcase,
  Building2,
  CalendarDays,
  CheckCircle2,
  DollarSign,
  FileText,
  Loader2,
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
import { useChat } from "@/lib/chat-store"
import { OnboardingWorkflow } from "@/components/copilot/modules/OnboardingWorkflow"
import { OnboardingTracker } from "@/components/copilot/modules/OnboardingTracker"
import { RecruitingWorkflow } from "@/components/copilot/modules/RecruitingWorkflow"
import { ApplicantTracker } from "@/components/copilot/modules/ApplicantTracker"
import { TicketResolver } from "@/components/copilot/modules/TicketResolver"
import { LifecycleTransfer } from "@/components/copilot/modules/LifecycleTransfer"
import { HRDashboard } from "@/components/copilot/modules/HRDashboard"
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
        "flex shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] font-semibold text-neutral-200",
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
      <span className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wide text-neutral-500">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </span>
      <span className="text-[13px] text-neutral-100">{value}</span>
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
        <p className="truncate text-[15px] font-semibold text-neutral-50">{title}</p>
        {subtitle && <p className="truncate text-[12.5px] text-neutral-400">{subtitle}</p>}
      </div>
    </div>
  )
}

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-white/[0.07] bg-white/[0.02] p-4",
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
            <div key={m.label} className="flex flex-col items-center gap-0.5 rounded-lg bg-white/[0.03] py-3">
              <span
                className={cn(
                  "text-[22px] font-semibold tabular-nums",
                  m.strong ? "text-neutral-50" : "text-neutral-300",
                )}
              >
                {m.value}
              </span>
              <span className="text-[10.5px] uppercase tracking-wide text-neutral-500">{m.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-neutral-500">
            <span>{used} used</span>
            <span>{usedPct}% of {total} days</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-neutral-200 transition-all"
              style={{ width: `${usedPct}%` }}
            />
          </div>
        </div>
        {pto.as_of && (
          <p className="mt-3 text-[11px] text-neutral-500">As of {pto.as_of}</p>
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
    <div className="flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
      <Avatar name={p.name} className="h-7 w-7 text-[11px]" />
      <div className="min-w-0">
        <p className="truncate text-[13px] text-neutral-100">{p.name}</p>
        {p.title && <p className="truncate text-[11px] text-neutral-500">{p.title}</p>}
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      {data?.manager && (
        <div>
          <p className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wide text-neutral-500">Reports to</p>
          <PersonRow p={{ name: data.manager }} />
        </div>
      )}

      <Panel className="border-white/15 bg-white/[0.05]">
        <div className="flex items-center gap-3">
          <Avatar name={e.name} className="h-10 w-10 text-[13px]" />
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-neutral-50">{e.name}</p>
            {e.title && <p className="truncate text-[12px] text-neutral-400">{e.title}</p>}
          </div>
        </div>
      </Panel>

      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wide text-neutral-500">
          <Users className="h-3 w-3" /> Direct reports ({reports.length})
        </p>
        <div className="flex flex-col gap-1.5">
          {reports.length > 0 ? (
            reports.map((r, i) => <PersonRow key={i} p={r} />)
          ) : (
            <p className="rounded-lg border border-dashed border-white/[0.08] px-3 py-2 text-[12px] text-neutral-500">
              No direct reports
            </p>
          )}
        </div>
      </div>

      {peers.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wide text-neutral-500">
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
        <p className="text-[12px] text-neutral-500">
          Results for <span className="text-neutral-300">“{data.query}”</span>
        </p>
      )}
      {results.map((r, i) => (
        <Panel key={i}>
          <div className="flex items-start gap-2">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold text-neutral-50">{r.title}</p>
              {r.section && <p className="text-[11.5px] text-neutral-400">{r.section}</p>}
            </div>
          </div>
          {r.snippet && (
            <p className="mt-2.5 text-[12.5px] leading-relaxed text-neutral-300">{r.snippet}</p>
          )}
          {r.source && (
            <p className="mt-2.5 border-t border-white/[0.06] pt-2 text-[11px] text-neutral-500">
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
      <Panel className="border-white/12 bg-white/[0.04]">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06]">
            <Icon className="h-4 w-4 text-neutral-200" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-neutral-50">{artifact.title}</p>
            <p className="text-[11.5px] text-neutral-400">Awaiting your approval before sending</p>
          </div>
        </div>
      </Panel>

      <Panel>
        <div className="flex flex-col gap-3">
          {rows.map(
            (r) =>
              r.value && (
                <div key={r.label} className="flex flex-col gap-0.5">
                  <span className="text-[10.5px] font-medium uppercase tracking-wide text-neutral-500">
                    {r.label}
                  </span>
                  <span className="text-[13px] text-neutral-100">{r.value}</span>
                </div>
              ),
          )}
          {body && (
            <div className="flex flex-col gap-1">
              <span className="text-[10.5px] font-medium uppercase tracking-wide text-neutral-500">
                Message
              </span>
              <div className="whitespace-pre-wrap rounded-lg border border-white/[0.06] bg-black/30 p-3 text-[13px] leading-relaxed text-neutral-200">
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
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.1] px-3 py-2.5 text-[13px] font-semibold text-neutral-50 transition-colors hover:bg-white/[0.16]"
          >
            <Send className="h-4 w-4" />
            Approve &amp; Send
          </button>
          <button
            onClick={reject}
            className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5 text-[13px] font-medium text-neutral-300 transition-colors hover:bg-white/[0.06]"
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
              ? "border-white/15 bg-white/[0.06] text-neutral-100"
              : "border-white/10 bg-white/[0.02] text-neutral-400",
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
        <div className="mb-3 flex items-center justify-between text-[11px] text-neutral-500">
          <span>Employee ID</span>
          <span className="font-mono text-neutral-300">{data?.employee_id || "—"}</span>
        </div>
        <div className="flex flex-col gap-2">
          {items.length === 0 ? (
            <p className="text-[12px] text-neutral-500">No checklist items</p>
          ) : (
            items.map((item) => {
              const done = String(item.status || "").toLowerCase() === "completed"
              return (
                <div
                  key={item.key || item.label}
                  className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {done ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-neutral-200" />
                    ) : (
                      <span className="h-4 w-4 shrink-0 rounded-full border border-white/20" />
                    )}
                    <span className="truncate text-[13px] text-neutral-100">
                      {item.label || item.key}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 text-[11px] font-medium uppercase tracking-wide",
                      done ? "text-neutral-200" : "text-neutral-500",
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
            <p className="mb-2 text-[12px] font-semibold text-neutral-100">{section.heading}</p>
          )}
          {section.body && (
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-neutral-300">
              {section.body}
            </p>
          )}
        </Panel>
      ))}
    </div>
  )
}

function ResumeScreening({ data }: { data: any }) {
  const recs: any[] = Array.isArray(data?.recommendations) ? data.recommendations : []
  const skills: string[] = Array.isArray(data?.required_skills) ? data.required_skills : []
  return (
    <div className="flex flex-col gap-3">
      <Panel>
        <CardTitle
          title={data?.job_role || "Role"}
          subtitle={skills.length ? `Skills: ${skills.join(", ")}` : "Candidate screening"}
        />
      </Panel>
      {data?.summary && (
        <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-neutral-400">{data.summary}</p>
      )}
      <div className="flex flex-col gap-2">
        {recs.map((c, i) => (
          <Panel key={c.id || i}>
            <div className="flex items-start justify-between gap-3">
              <CardTitle title={`${i + 1}. ${c.name}`} subtitle={c.summary} name={c.name} />
              <span className="shrink-0 text-[11px] font-medium tabular-nums text-neutral-300">
                {c.match_count}/{skills.length || "?"}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(c.matched_skills || []).map((s: string) => (
                <span
                  key={s}
                  className="rounded-md border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[11px] text-neutral-200"
                >
                  {s}
                </span>
              ))}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  )
}

function TrainingTracker({ data }: { data: any }) {
  return (
    <div className="flex flex-col gap-3">
      <Panel>
        <CardTitle
          title={data?.module_name || "Training module"}
          subtitle={data?.status || "Pending"}
        />
      </Panel>
      <Panel>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Employee ID" value={data?.employee_id} />
          <Field label="Due date" value={data?.due_date} />
          <Field label="Status" value={data?.status} />
          <Field label="Training ID" value={data?.training_id} />
        </div>
      </Panel>
      {data?.summary && (
        <p className="text-[12.5px] leading-relaxed text-neutral-400">{data.summary}</p>
      )}
    </div>
  )
}

function ScheduleMaker({ data }: { data: any }) {
  const shifts: any[] = Array.isArray(data?.shifts) ? data.shifts : []
  const byDay = shifts.reduce((acc: Record<string, any[]>, s) => {
    const day = s.day || "Day"
    ;(acc[day] ||= []).push(s)
    return acc
  }, {})
  return (
    <div className="flex flex-col gap-3">
      <Panel>
        <CardTitle
          title={data?.department || "Department"}
          subtitle={`Week of ${data?.week_start_date || "—"} · ${data?.total_staff_slots ?? shifts.length} slots`}
        />
      </Panel>
      {Object.entries(byDay).map(([day, dayShifts]) => (
        <Panel key={day}>
          <p className="mb-2 text-[12px] font-semibold text-neutral-100">{day}</p>
          <div className="flex flex-col gap-1.5">
            {(dayShifts as any[]).map((s, i) => (
              <div
                key={`${day}-${i}`}
                className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[12.5px]"
              >
                <span className="text-neutral-200">
                  {s.shift} · {s.hours}
                </span>
                <span className="text-neutral-500">{s.headcount} staff</span>
              </div>
            ))}
          </div>
        </Panel>
      ))}
    </div>
  )
}

function JsonFallback({ data }: { data: any }) {
  return (
    <Panel className="p-3">
      <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed text-neutral-300">
        {JSON.stringify(data, null, 2)}
      </pre>
    </Panel>
  )
}

function EmailDrafter({ data }: { data: any }) {
  const sendMessage = useChat((s) => s.sendMessage)
  const isRunning = useChat((s) => s.isRunning)
  const [toEmail, setToEmail] = useState(String(data?.to_email || data?.to || ""))
  const [subject, setSubject] = useState(String(data?.subject || ""))
  const [body, setBody] = useState(String(data?.body || ""))
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    setToEmail(String(data?.to_email || data?.to || ""))
    setSubject(String(data?.subject || ""))
    setBody(String(data?.body || ""))
    setSubmitted(false)
  }, [data?.to_email, data?.to, data?.subject, data?.body])

  const approveAndSend = async () => {
    const to = toEmail.trim()
    const subj = subject.trim()
    if (!to || !subj) {
      toast.error("To and Subject are required before sending.")
      return
    }
    const approval = [
      "[APPROVED TO SEND] Please execute the Gmail send tool with these exact details.",
      `To: ${to}, Subject: ${subj}, Body: ${body}`,
    ].join(" ")
    setSubmitted(true)
    try {
      await sendMessage(approval)
      toast.success("Approval sent — agent will dispatch via Gmail")
    } catch (err) {
      setSubmitted(false)
      toast.error(err instanceof Error ? err.message : "Failed to submit approval")
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5 text-[12.5px] text-emerald-100">
        <Mail className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Sending from your connected Google Account</span>
      </div>

      <Panel className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[10.5px] font-medium uppercase tracking-wide text-neutral-500">
            To
          </span>
          <input
            type="email"
            value={toEmail}
            onChange={(e) => setToEmail(e.target.value)}
            disabled={submitted || isRunning}
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-[13px] text-neutral-100 outline-none focus:border-white/25 disabled:opacity-60"
            placeholder="recipient@company.com"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[10.5px] font-medium uppercase tracking-wide text-neutral-500">
            Subject
          </span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={submitted || isRunning}
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-[13px] text-neutral-100 outline-none focus:border-white/25 disabled:opacity-60"
            placeholder="Email subject"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[10.5px] font-medium uppercase tracking-wide text-neutral-500">
            Body
          </span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={submitted || isRunning}
            rows={12}
            className="w-full resize-y rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-[13px] leading-relaxed text-neutral-100 outline-none focus:border-white/25 disabled:opacity-60"
            placeholder="Write the email body…"
          />
        </label>
      </Panel>

      {submitted ? (
        <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2.5 text-[12.5px] text-neutral-100">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Approval submitted. Waiting for the agent to send via Gmail.
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void approveAndSend()}
          disabled={isRunning}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.1] px-3 py-2.5 text-[13px] font-semibold text-neutral-50 transition-colors hover:bg-white/[0.16] disabled:opacity-50"
        >
          {isRunning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Approve &amp; Send
        </button>
      )}
    </div>
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
      return <OnboardingWorkflow data={artifact.data} />
    case "onboarding_workflow":
      return <OnboardingWorkflow data={artifact.data} />
    case "onboarding_tracker":
      return <OnboardingTracker data={artifact.data} />
    case "lifecycle_transfer":
      return <LifecycleTransfer data={artifact.data} />
    case "recruiting_posting":
      return <RecruitingWorkflow data={artifact.data} />
    case "applicant_tracker":
      return <ApplicantTracker data={artifact.data} />
    case "helpdesk_ticket":
      return <TicketResolver data={artifact.data} />
    case "hr_dashboard":
      return <HRDashboard data={artifact.data} />
    case "document_creation":
      return <DocumentCreation data={artifact.data} />
    case "resume_screening":
      return <ResumeScreening data={artifact.data} />
    case "training_tracker":
      return <TrainingTracker data={artifact.data} />
    case "schedule_maker":
      return <ScheduleMaker data={artifact.data} />
    case "email_drafter":
      return <EmailDrafter data={artifact.data} />
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
  onboarding_workflow: "Onboarding",
  onboarding_tracker: "Tracker",
  lifecycle_transfer: "Transfer",
  recruiting_posting: "Recruiting",
  applicant_tracker: "Applicants",
  helpdesk_ticket: "Helpdesk",
  hr_dashboard: "Dashboard",
  document_creation: "Document",
  resume_screening: "Screening",
  training_tracker: "Training",
  schedule_maker: "Schedule",
  email_drafter: "Email",
  json: "Data",
}
