"use client"

import { useState } from "react"
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  DollarSign,
  Loader2,
  Send,
  Shield,
} from "lucide-react"
import { toast } from "sonner"
import { useChat } from "@/lib/chat-store"
import { cn } from "@/lib/utils"

export type LifecycleTransferData = {
  employee_id?: string
  employee_name?: string
  email?: string
  effective_date?: string
  employment_type?: string
  changes?: {
    role?: { from?: string; to?: string }
    department?: { from?: string; to?: string }
    manager?: { from?: string; to?: string }
    salary?: { from?: number; to?: number }
  }
  salary_delta?: number
  pct_change?: number
  nda_addendum_required?: boolean
  nda_link?: string
  transfer_memo?: string
  compliance?: {
    rcw_4962_reason?: string
    noncompete_allowed?: boolean
    nda_addendum_required?: boolean
    threshold?: number
  }
  [key: string]: unknown
}

type Props = {
  data?: LifecycleTransferData | null
}

function money(v: unknown): string {
  if (v == null || v === "") return "—"
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n)
}

function ChangeRow({
  label,
  from,
  to,
  format = (v) => (v == null || v === "" ? "—" : String(v)),
}: {
  label: string
  from?: unknown
  to?: unknown
  format?: (v: unknown) => string
}) {
  const changed = from !== to && to != null && to !== ""
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">
          Before · {label}
        </p>
        <p className="mt-0.5 truncate text-[13px] text-neutral-300">{format(from)}</p>
      </div>
      <ArrowRight
        className={cn("h-3.5 w-3.5 shrink-0", changed ? "text-emerald-400" : "text-neutral-600")}
      />
      <div className="min-w-0 text-right">
        <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">
          After · {label}
        </p>
        <p
          className={cn(
            "mt-0.5 truncate text-[13px]",
            changed ? "font-semibold text-emerald-300" : "text-neutral-300",
          )}
        >
          {format(to ?? from)}
        </p>
      </div>
    </div>
  )
}

export function LifecycleTransfer({ data }: Props) {
  const sendMessage = useChat((s) => s.sendMessage)
  const isRunning = useChat((s) => s.isRunning)
  const [submitted, setSubmitted] = useState(false)

  const changes = data?.changes ?? {}
  const pct = Number(data?.pct_change ?? 0)
  const delta = Number(data?.salary_delta ?? 0)

  const approve = async () => {
    setSubmitted(true)
    try {
      await sendMessage("[UPDATE APPROVED] Apply the drafted transfer packet.")
      toast.success("Approval sent — applying the transfer")
    } catch (err) {
      setSubmitted(false)
      toast.error(err instanceof Error ? err.message : "Failed to submit approval")
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <div className="rounded-xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-transparent p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">
            Lifecycle · Transfer
          </p>
          <h2 className="mt-1 text-[16px] font-semibold text-neutral-50">
            {data?.employee_name || "Employee"}
          </h2>
          <p className="mt-1 text-[12px] text-neutral-400">
            {[data?.employee_id, data?.email, data?.effective_date && `Effective ${data.effective_date}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        <div className="space-y-2">
          <ChangeRow label="Role" from={changes.role?.from} to={changes.role?.to} />
          <ChangeRow label="Department" from={changes.department?.from} to={changes.department?.to} />
          <ChangeRow label="Manager" from={changes.manager?.from} to={changes.manager?.to} />
          <ChangeRow
            label="Salary"
            from={changes.salary?.from}
            to={changes.salary?.to}
            format={money}
          />
        </div>

        {delta !== 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-[13px] text-neutral-200">
            <DollarSign className="h-4 w-4 shrink-0 text-neutral-400" />
            <span>
              Compensation delta{" "}
              <span className="font-semibold text-neutral-50">
                {money(delta)} ({pct >= 0 ? "+" : ""}
                {pct}%)
              </span>
            </span>
          </div>
        )}

        {(data?.compliance?.rcw_4962_reason || data?.nda_addendum_required) && (
          <div
            className={cn(
              "rounded-xl border px-4 py-3",
              data?.nda_addendum_required
                ? "border-amber-500/30 bg-amber-500/[0.06]"
                : "border-white/[0.07] bg-white/[0.02]",
            )}
          >
            <div className="flex items-start gap-2">
              <Shield className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-neutral-100">RCW 49.62 check</p>
                {data?.compliance?.rcw_4962_reason ? (
                  <p className="mt-1 text-[12.5px] leading-relaxed text-neutral-300">
                    {data.compliance.rcw_4962_reason}
                  </p>
                ) : null}
                {data?.nda_addendum_required ? (
                  <p className="mt-2 text-[12px] font-medium text-amber-200">
                    NDA addendum required — salary crossed $
                    {(data?.compliance?.threshold ?? 126858.83).toLocaleString("en-US")} and no prior
                    NDA applied.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {data?.transfer_memo ? (
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
            <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-neutral-100">
              <Briefcase className="h-3.5 w-3.5" />
              Transfer memo
            </p>
            <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-neutral-300">
              {data.transfer_memo}
            </p>
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-white/[0.08] bg-[#0a0a0a] px-4 py-3">
        {submitted ? (
          <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2.5 text-[12.5px] text-neutral-100">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Approval submitted. Applying the transfer…
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void approve()}
            disabled={isRunning}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.1] text-[13px] font-semibold text-neutral-50 transition-colors hover:bg-white/[0.16] disabled:opacity-50"
          >
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Approve Transfer
          </button>
        )}
        <p className="mt-2 text-center text-[11px] text-neutral-500">
          Sends <span className="font-mono text-neutral-400">[UPDATE APPROVED]</span> to patch
          role, department, and salary in Cosmos.
        </p>
      </div>
    </div>
  )
}
