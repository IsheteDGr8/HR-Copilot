"use client"

import { CircleHelp } from "lucide-react"
import { channelIcons, DispositionPill, UrgencyDot } from "@/components/intake-bits"
import { StatusPill } from "@/components/work-bits"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { channelMeta, dispositionMeta, type IntakeChannel, type IntakeDisposition } from "@/lib/intake-data"
import { type WorkStatus } from "@/lib/hr-data"

const URGENCY: { key: "urgent" | "high" | "normal" | "low"; label: string; blurb: string }[] = [
  { key: "urgent", label: "Urgent", blurb: "Act now — SLA is at risk." },
  { key: "high", label: "High", blurb: "Prioritize ahead of normal work." },
  { key: "normal", label: "Normal", blurb: "Standard queue order." },
  { key: "low", label: "Low", blurb: "Handle when capacity allows." },
]

const DISPOSITIONS: IntakeDisposition[] = ["auto", "assist", "human"]
const CHANNELS: IntakeChannel[] = ["helpdesk", "email", "portal", "chat", "system", "form", "phone"]
const STATUSES: WorkStatus[] = [
  "queued",
  "running",
  "needs_approval",
  "blocked",
  "completed",
  "failed",
]

export function LegendPopover({ variant }: { variant: "intake" | "work" }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Legend"
        >
          <CircleHelp className="size-3.5" />
          Legend
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-4 p-4">
        {variant === "intake" ? <IntakeLegend /> : <WorkLegend />}
      </PopoverContent>
    </Popover>
  )
}

function IntakeLegend() {
  return (
    <>
      <section>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Urgency</p>
        <ul className="mt-2 space-y-1.5">
          {URGENCY.map((u) => (
            <li key={u.key} className="flex items-start gap-2 text-xs">
              <span className="mt-1">
                <UrgencyDot urgency={u.key} />
              </span>
              <span>
                <span className="font-medium text-foreground">{u.label}</span>
                <span className="text-muted-foreground"> — {u.blurb}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Disposition</p>
        <ul className="mt-2 space-y-2">
          {DISPOSITIONS.map((d) => (
            <li key={d} className="flex items-start gap-2 text-xs">
              <DispositionPill disposition={d} />
              <span className="pt-0.5 text-muted-foreground">{dispositionMeta[d].blurb}</span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Channels</p>
        <ul className="mt-2 grid grid-cols-2 gap-1.5">
          {CHANNELS.map((ch) => {
            const Icon = channelIcons[ch]
            return (
              <li key={ch} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className="size-3.5 text-navy/70" />
                {channelMeta[ch]}
              </li>
            )
          })}
        </ul>
      </section>
    </>
  )
}

const STATUS_BLURB: Record<WorkStatus, string> = {
  queued: "Created, not started yet.",
  running: "Agent is working in a chat.",
  needs_approval: "Paused — you need to approve.",
  blocked: "Stuck or missing input.",
  completed: "Finished successfully.",
  failed: "The run errored.",
}

function WorkLegend() {
  return (
    <section>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</p>
      <ul className="mt-2 space-y-2">
        {STATUSES.map((s) => (
          <li key={s} className="flex items-start gap-2 text-xs">
            <StatusPill status={s} />
            <span className="pt-0.5 text-muted-foreground">{STATUS_BLURB[s]}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
