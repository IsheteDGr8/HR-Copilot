"use client"

import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileText,
  Headset,
  Loader2,
  Sparkles,
  TicketCheck,
  UserPlus,
  XCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  sourceMeta,
  statusMeta,
  type WorkItem,
  type WorkSource,
  type WorkStatus,
} from "@/lib/hr-data"
import { useChat } from "@/lib/chat-store"
import { useNavigation } from "@/lib/navigation"

export const sourceIcons: Record<WorkSource, typeof TicketCheck> = {
  onboarding: UserPlus,
  recruiting: UserPlus,
  helpdesk: Headset,
  ticketing: TicketCheck,
  attendance: Clock,
  leave: CalendarClock,
  documents: FileText,
  adhoc: Sparkles,
}

const toneClasses: Record<string, string> = {
  warning: "bg-warning/15 text-warning border-warning/30",
  primary: "bg-navy/10 text-navy border-navy/30",
  muted: "bg-muted text-muted-foreground border-border",
  destructive: "bg-destructive/10 text-destructive border-destructive/30",
  success: "bg-success/15 text-success border-success/30",
}

export function formatWorkTime(value?: string) {
  if (!value) return ""
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) return value
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function StatusPill({ status, className }: { status: WorkStatus; className?: string }) {
  const meta = statusMeta[status] ?? statusMeta.queued
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        toneClasses[meta.tone],
        className,
      )}
    >
      {status === "running" ? (
        <Loader2 className="size-3 animate-spin text-navy" />
      ) : status === "needs_approval" ? (
        <AlertTriangle className="size-3 text-warning" />
      ) : status === "completed" ? (
        <CheckCircle2 className="size-3 text-success" />
      ) : status === "blocked" || status === "failed" ? (
        <XCircle className="size-3 text-destructive" />
      ) : (
        <span className="size-1.5 rounded-full bg-muted-foreground" />
      )}
      {meta.label}
    </span>
  )
}

export function SourceTag({ source }: { source: WorkSource }) {
  const Icon = sourceIcons[source] || Sparkles
  const meta = sourceMeta[source] || sourceMeta.adhoc
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <Icon className="size-3.5 text-navy/70" />
      {meta.label}
      <span className="text-border">·</span>
      <span className="text-muted-foreground/80">{meta.system}</span>
    </span>
  )
}

export function WorkRow({ item }: { item: WorkItem }) {
  const nav = useNavigation()
  const selectConversation = useChat((s) => s.selectConversation)

  const open = () => {
    if (item.linkedChatId) {
      selectConversation(item.linkedChatId)
      nav.setView("chat")
      return
    }
    nav.navigateToWorkDetail(item.id)
  }

  return (
    <button
      type="button"
      onClick={open}
      className="group flex w-full flex-col gap-2 border-b border-border px-4 py-3 text-left transition-colors last:border-0 hover:bg-sidebar-accent/60 md:flex-row md:items-center md:gap-4"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] font-medium text-navy/80">{item.id}</span>
          {item.priority !== "normal" && (
            <span
              className={cn(
                "rounded border px-1.5 text-[10px] font-semibold uppercase tracking-wide",
                item.priority === "urgent"
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-warning/30 bg-warning/15 text-warning",
              )}
            >
              {item.priority}
            </span>
          )}
        </div>
        <p className="truncate text-sm font-medium text-foreground transition-colors group-hover:text-primary">
          {item.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <SourceTag source={item.source} />
          {item.externalRef && (
            <span className="text-[11px] text-muted-foreground">{item.externalRef}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 md:w-[420px] md:justify-end">
        <div className="hidden text-right lg:block">
          <p className="text-xs text-foreground">{item.subject.name}</p>
          <p className="text-[11px] text-muted-foreground">{item.subject.role}</p>
        </div>
        <div className="hidden w-28 sm:block">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                item.status === "blocked" || item.status === "failed"
                  ? "bg-destructive"
                  : item.status === "completed"
                    ? "bg-success"
                    : item.status === "needs_approval"
                      ? "bg-warning"
                      : "bg-navy",
              )}
              style={{ width: `${item.progress}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {item.sla || formatWorkTime(item.updatedAt || item.updated)}
          </p>
        </div>
        <StatusPill status={item.status} />
      </div>
    </button>
  )
}
