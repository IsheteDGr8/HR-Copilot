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
  isRestrictedCategory,
  type IntakeCategory,
  type IntakeChannel,
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
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        toneRing[meta.tone],
        className,
      )}
    >
      <Icon className="size-3" />
      {meta.label}
    </span>
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
  const restricted = isRestrictedCategory(item.category)
  const nav = useNavigation()

  return (
    <button
      type="button"
      onClick={() => nav.navigateToClusterDetail(item.category.toLowerCase().replace(/\s+/g, "-").replace(/&/g, "and"))}
      className="group flex w-full items-start gap-3 border-b border-border px-4 py-2.5 text-left transition-colors last:border-0 hover:bg-sidebar-accent/60"
    >
      <div className="mt-1 flex items-center gap-2">
        <UrgencyDot urgency={item.urgency} />
        {restricted ? (
          <ShieldAlert className="size-3.5 text-destructive" />
        ) : (
          <Channel className="size-3.5 text-navy/70" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <p className="line-clamp-1 text-sm font-medium transition-colors group-hover:text-primary">
            {item.subject}
          </p>
          <span className="font-mono text-[10px] text-muted-foreground">{item.id}</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {item.requester.name} · {channelMeta[item.channel]} · {item.age} ago
        </p>
        {!dense && item.suggestion && (
          <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground/80">{item.suggestion}</p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <DispositionPill disposition={item.disposition} />
        <span className="text-[10px] text-muted-foreground">{item.dueLabel}</span>
      </div>
    </button>
  )
}

export function CategoryCard({ category, count }: { category: IntakeCategory; count: number }) {
  const nav = useNavigation()

  return (
    <button
      type="button"
      onClick={() => nav.navigateToClusterDetail(category.id)}
      className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-all hover:border-border/80 hover:shadow-sm"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium transition-colors group-hover:text-primary">
          {category.label}
        </p>
      </div>
      <div className="text-right">
        <p className="text-lg font-semibold leading-none tabular-nums">{count}</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">open</p>
      </div>
    </button>
  )
}
