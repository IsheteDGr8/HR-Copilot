"use client"

import {
  AlertOctagon,
  CheckCircle2,
  CircleDot,
  Mail,
  MessageSquare,
  Phone,
  Radio,
  ShieldAlert,
  Sparkles,
  TicketCheck,
  UserSquare,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  channelMeta,
  dispositionMeta,
  type IntakeChannel,
  type IntakeCluster,
  type IntakeDisposition,
  type IntakeItem,
} from "@/lib/intake-data"
import { useNavigation } from "@/lib/navigation"

export const channelIcons: Record<IntakeChannel, typeof Mail> = {
  helpdesk: TicketCheck,
  email: Mail,
  portal: UserSquare,
  chat: MessageSquare,
  system: Radio,
  form: CircleDot,
  phone: Phone,
}

export const dispositionIcons: Record<IntakeDisposition, typeof Sparkles> = {
  auto: CheckCircle2,
  assist: Sparkles,
  human: AlertOctagon,
}

const toneRing: Record<string, string> = {
  success: "border-success/30 bg-success/10 text-success",
  primary: "border-navy/30 bg-navy/10 text-navy",
  warning: "border-warning/30 bg-warning/10 text-warning",
  destructive: "border-destructive/30 bg-destructive/10 text-destructive",
}

export function DispositionPill({
  disposition,
  className,
}: {
  disposition: IntakeDisposition
  className?: string
}) {
  const meta = dispositionMeta[disposition]
  const Icon = dispositionIcons[disposition]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        toneRing[meta.tone],
        className,
      )}
    >
      <Icon className="size-3" />
      {meta.label}
    </span>
  )
}

export function Sparkline({ values, tone = "primary" }: { values: number[]; tone?: string }) {
  const max = Math.max(...values, 1)
  return (
    <div className="flex h-6 items-end gap-[3px]">
      {values.map((v, i) => (
        <span
          key={i}
          className={cn(
            "w-1 rounded-sm transition-all duration-300",
            tone === "warning" ? "bg-warning/80" : "bg-navy/70",
            i === values.length - 1 ? "opacity-100" : "opacity-50",
          )}
          style={{ height: `${Math.max(12, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  )
}

export function UrgencyDot({ urgency }: { urgency: IntakeItem["urgency"] }) {
  const color =
    urgency === "urgent"
      ? "bg-destructive"
      : urgency === "high"
        ? "bg-warning"
        : urgency === "normal"
          ? "bg-navy"
          : "bg-muted-foreground/40"
  return <span className={cn("size-2 shrink-0 rounded-full", color)} title={urgency} />
}

export function IntakeRow({ item, dense = false }: { item: IntakeItem; dense?: boolean }) {
  const Channel = channelIcons[item.channel]
  const restricted = item.clusterId === "employee-relations"
  const nav = useNavigation()

  return (
    <button
      type="button"
      onClick={() => nav.navigateToClusterDetail(item.clusterId)}
      className="group flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-0 hover:bg-sidebar-accent/60"
    >
      <div className="mt-1.5 flex items-center gap-2">
        <UrgencyDot urgency={item.urgency} />
        {restricted ? (
          <ShieldAlert className="size-3.5 text-destructive" />
        ) : (
          <Channel className="size-3.5 text-navy/70" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="line-clamp-2 text-sm font-medium transition-colors group-hover:text-primary">{item.subject}</p>
          <span className="font-mono text-[10px] text-navy/80">{item.id}</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {item.requester.name} · {channelMeta[item.channel]} · {item.age} ago
        </p>
        {!dense && (
          <p className="mt-1.5 line-clamp-1 text-xs text-muted-foreground/80">{item.suggestion}</p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <DispositionPill disposition={item.disposition} />
        <span className="text-[11px] text-muted-foreground">{item.due}</span>
      </div>
    </button>
  )
}

export function ClusterCard({ cluster, count }: { cluster: IntakeCluster; count: number }) {
  const nav = useNavigation()

  return (
    <button
      type="button"
      onClick={() => nav.navigateToClusterDetail(cluster.id)}
      className={cn(
        "group flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left transition-all duration-200 hover:shadow-sm",
        cluster.discovered && "border-warning/40 bg-warning/5",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label-caps text-navy">{cluster.domain}</p>
          <p className="mt-1 truncate text-sm font-medium transition-colors group-hover:text-primary">
            {cluster.label}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xl font-semibold leading-none">{count}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">open</p>
        </div>
      </div>

      <p className="line-clamp-2 text-xs text-muted-foreground">{cluster.blurb}</p>

      <div className="mt-auto flex items-end justify-between gap-3">
        <Sparkline values={cluster.trend} tone={cluster.discovered ? "warning" : "primary"} />
        {cluster.discovered ? (
          <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
            New pattern
          </span>
        ) : cluster.playbook ? (
          <span className="truncate font-mono text-[10px] text-success">{cluster.playbook}</span>
        ) : (
          <span className="text-[10px] text-muted-foreground">No playbook</span>
        )}
      </div>
    </button>
  )
}
