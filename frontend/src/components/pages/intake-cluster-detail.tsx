"use client"

import { useMemo, useState } from "react"
import { PageContainer } from "@/components/management/shared"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Forward,
  Loader2,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react"
import {
  DispositionPill,
  UrgencyDot,
  channelIcons,
} from "@/components/intake-bits"
import {
  categoryLabelFromId,
  channelMeta,
  isRestrictedCategory,
  itemsForCategory,
  openTickets,
  type IntakeCategory,
  type IntakeItem,
} from "@/lib/intake-data"
import type { IntakeTicketPatch } from "@/lib/intake-api"
import { useChat } from "@/lib/chat-store"
import { useNavigation } from "@/lib/navigation"
import { cn } from "@/lib/utils"

type Props = {
  categoryId?: string
  tickets: IntakeItem[]
  categories: IntakeCategory[]
  patchTicket: (id: string, body: IntakeTicketPatch) => Promise<IntakeItem>
  reload: () => Promise<void>
}

function sourceFromTicket(item: IntakeItem): string {
  const cat = `${item.category} ${item.topic || ""}`.toLowerCase()
  if (cat.includes("onboard")) return "onboarding"
  if (cat.includes("recruit") || cat.includes("hiring")) return "recruiting"
  if (cat.includes("leave") || cat.includes("pto") || cat.includes("time off")) return "leave"
  if (cat.includes("attend") || cat.includes("timesheet")) return "attendance"
  if (cat.includes("document") || cat.includes("letter")) return "documents"
  return "helpdesk"
}

function buildDelegatePrompt(item: IntakeItem): string {
  const who = `${item.requester.name} (${item.requester.role})${
    item.employeeId ? `, employee ID ${item.employeeId}` : ""
  }`
  const header = `Intake ticket ${item.id}
Subject: ${item.subject}
Category: ${item.category}
Channel: ${item.channel}
Requester: ${who}
Urgency: ${item.urgency}

Ticket body:
${item.snippet || "(no body provided)"}

Copilot suggestion: ${item.suggestion || "none"}`

  if (item.disposition === "human") {
    return `${header}

Please help me decide how to handle this ticket. Summarize the situation, flag any policy or sensitivity issues, and recommend the next action. Do not execute irreversible actions until I confirm.`
  }

  return `${header}

Please handle this ticket: follow the suggestion, look up the employee if needed, draft or execute the appropriate HR action, and pause for my approval before sending or making irreversible changes.`
}

function CategoryPageContent({ categoryId: propCategoryId, tickets, categories, patchTicket }: Props) {
  const nav = useNavigation()
  const [selectedId, setSelectedId] = useState("")

  const targetCategoryId = propCategoryId || nav.selectedClusterId || categories[0]?.id || ""
  const categoryLabel = categoryLabelFromId(categories, targetCategoryId)
  const items = useMemo(() => itemsForCategory(tickets, categoryLabel), [tickets, categoryLabel])
  const selected = items.find((i) => i.id === selectedId) ?? items[0]
  const restricted = isRestrictedCategory(categoryLabel)

  const handleBack = () => {
    nav.setSelectedClusterId(null)
    nav.setView("intake")
  }

  return (
    <PageContainer>
      <div className="dream-in space-y-5">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5 text-primary" />
          Back
        </button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">{categoryLabel}</h1>
              {restricted && (
                <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                  <ShieldAlert className="size-3" />
                  Restricted
                </span>
              )}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card px-4 py-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Open</p>
            <p className="text-xl font-semibold tabular-nums">
              {openTickets(items).length}
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-2">
              <p className="text-xs text-muted-foreground">{items.length} requests</p>
            </div>
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-muted-foreground">No tickets in this category.</p>
            ) : (
              [...items]
                .sort((a, b) => a.ageMinutes - b.ageMinutes)
                .map((i) => {
                  const Channel = channelIcons[i.channel]
                  return (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() => setSelectedId(i.id)}
                      className={cn(
                        "flex w-full items-start gap-3 border-b border-border px-4 py-2.5 text-left transition-colors last:border-0 hover:bg-sidebar-accent/60",
                        selected?.id === i.id && "bg-sidebar-accent",
                      )}
                    >
                      <div className="mt-1 flex items-center gap-2">
                        <UrgencyDot urgency={i.urgency} />
                        <Channel className="size-3.5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{i.subject}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {i.requester.name} · {i.age} ago
                        </p>
                      </div>
                      <DispositionPill disposition={i.disposition} />
                    </button>
                  )
                })
            )}
          </section>

          {selected ? (
            <TriagePanel
              item={selected}
              categoryLabel={categoryLabel}
              categories={categories}
              patchTicket={patchTicket}
            />
          ) : null}
        </div>
      </div>
    </PageContainer>
  )
}

function TriagePanel({
  item,
  categoryLabel,
  categories,
  patchTicket,
}: {
  item: IntakeItem
  categoryLabel: string
  categories: IntakeCategory[]
  patchTicket: (id: string, body: IntakeTicketPatch) => Promise<IntakeItem>
}) {
  const Channel = channelIcons[item.channel]
  const nav = useNavigation()
  const [action, setAction] = useState<TriageActionKind | null>(null)
  const [outcome, setOutcome] = useState<string | null>(null)

  return (
    <aside className="h-fit rounded-lg border border-border bg-card lg:sticky lg:top-20">
      <div className="border-b border-border px-4 py-3">
        <p className="font-mono text-[10px] text-muted-foreground">{item.id}</p>
        <p className="mt-1 text-sm font-medium leading-snug">{item.subject}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <DispositionPill disposition={item.disposition} />
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Channel className="size-3" />
            {channelMeta[item.channel]}
          </span>
        </div>
      </div>

      <div className="space-y-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold">
            {item.requester.initials}
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-xs font-medium">{item.requester.name}</p>
            <p className="truncate text-[10px] text-muted-foreground">{item.requester.role}</p>
          </div>
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock3 className="size-3" />
            {item.dueLabel}
          </span>
        </div>

        {item.snippet && (
          <p className="rounded-md border border-border bg-background px-3 py-2 text-[11px] text-muted-foreground line-clamp-4">
            {item.snippet}
          </p>
        )}

        {item.suggestion && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Copilot
            </p>
            <p className="mt-1 text-xs">{item.suggestion}</p>
            {item.confidence > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      item.confidence >= 0.8
                        ? "bg-emerald-400"
                        : item.confidence >= 0.5
                          ? "bg-primary"
                          : "bg-amber-400",
                    )}
                    style={{ width: `${Math.round(item.confidence * 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {Math.round(item.confidence * 100)}%
                </span>
              </div>
            )}
          </div>
        )}

        <div className="space-y-2 pt-1">
          {item.linkedWorkId ? (
            <button
              onClick={() => nav?.navigateToWorkDetail(item.linkedWorkId!)}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <ArrowRight className="size-4" />
              Open {item.linkedWorkId}
            </button>
          ) : (
            <button
              onClick={() => {
                const prompt = buildDelegatePrompt(item)
                void useChat.getState().startDelegatedRun(prompt, {
                  title: item.subject,
                  linkedTicketId: item.id,
                  source: sourceFromTicket(item),
                  category: item.category,
                  subject: item.requester,
                })
                nav?.setView("chat")
              }}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Sparkles className="size-4" />
              {item.disposition === "human" ? "Ask Copilot" : "Release to Copilot"}
            </button>
          )}
          <div className="grid grid-cols-3 gap-2">
            <TriageAction icon={Forward} label="Route" onClick={() => setAction("route")} />
            <TriageAction icon={Users} label="Group" onClick={() => setAction("group")} />
            <TriageAction icon={CheckCircle2} label="Close" onClick={() => setAction("close")} />
          </div>
          {outcome && (
            <p className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-[11px] text-success">
              {outcome}
            </p>
          )}
        </div>
      </div>

      <TriageActionDialog
        kind={action}
        item={item}
        categoryLabel={categoryLabel}
        categories={categories}
        patchTicket={patchTicket}
        onClose={() => setAction(null)}
        onDone={(summary) => {
          setOutcome(summary)
          setAction(null)
          toast.success(summary)
        }}
      />
    </aside>
  )
}

function TriageAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Forward
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1 rounded-md border border-border px-2 py-2 text-[10px] text-muted-foreground hover:border-border/80 hover:text-foreground"
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  )
}

type TriageActionKind = "route" | "group" | "close"

const routeTargets = [
  { id: "hr-ops", label: "HR Operations" },
  { id: "payroll", label: "Payroll" },
  { id: "people-partner", label: "People Partner" },
  { id: "legal", label: "Legal & Compliance" },
  { id: "mobility", label: "Global Mobility" },
]

const closeReasons = [
  { id: "resolved", label: "Resolved" },
  { id: "duplicate", label: "Duplicate" },
  { id: "no-action", label: "No action needed" },
  { id: "withdrawn", label: "Withdrawn" },
]

function TriageActionDialog({
  kind,
  item,
  categoryLabel,
  categories,
  patchTicket,
  onClose,
  onDone,
}: {
  kind: TriageActionKind | null
  item: IntakeItem
  categoryLabel: string
  categories: IntakeCategory[]
  patchTicket: (id: string, body: IntakeTicketPatch) => Promise<IntakeItem>
  onClose: () => void
  onDone: (summary: string) => void
}) {
  const [target, setTarget] = useState(routeTargets[0]!.id)
  const [groupTarget, setGroupTarget] = useState(categoryLabel)
  const [newCategory, setNewCategory] = useState("")
  const [reason, setReason] = useState(closeReasons[0]!.id)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    try {
      if (kind === "route") {
        const t = routeTargets.find((r) => r.id === target)!
        await patchTicket(item.id, {
          action: "route",
          route_target: target,
          note: note || undefined,
          employee_id: item.employeeId,
        })
        onDone(`${item.id} routed to ${t.label}.`)
      } else if (kind === "group") {
        const name =
          groupTarget === "__new"
            ? newCategory.trim() || "New category"
            : groupTarget
        await patchTicket(item.id, {
          action: "group",
          category: name,
          note: note || undefined,
          employee_id: item.employeeId,
        })
        onDone(`${item.id} grouped into "${name}".`)
      } else if (kind === "close") {
        const r = closeReasons.find((c) => c.id === reason)!
        await patchTicket(item.id, {
          action: "close",
          close_reason: reason,
          note: note || undefined,
          employee_id: item.employeeId,
        })
        onDone(`${item.id} closed — ${r.label.toLowerCase()}.`)
      }
      setNote("")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={kind !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {kind === "route" ? "Route" : kind === "group" ? "Group" : "Close"}
          </DialogTitle>
          <DialogDescription className="text-xs">{item.subject}</DialogDescription>
        </DialogHeader>

        {kind === "route" && (
          <div className="space-y-1.5">
            {routeTargets.map((t) => (
              <label
                key={t.id}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm",
                  target === t.id ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                <input
                  type="radio"
                  name="route-target"
                  checked={target === t.id}
                  onChange={() => setTarget(t.id)}
                />
                {t.label}
              </label>
            ))}
          </div>
        )}

        {kind === "group" && (
          <div className="space-y-2">
            <select
              value={groupTarget}
              onChange={(e) => setGroupTarget(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.label}>
                  {c.label}
                  {c.label === categoryLabel ? " (current)" : ""}
                </option>
              ))}
              <option value="__new">+ New category…</option>
            </select>
            {groupTarget === "__new" && (
              <input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Category name"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none"
              />
            )}
          </div>
        )}

        {kind === "close" && (
          <div className="space-y-1.5">
            {closeReasons.map((r) => (
              <label
                key={r.id}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm",
                  reason === r.id ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                <input
                  type="radio"
                  name="close-reason"
                  checked={reason === r.id}
                  onChange={() => setReason(r.id)}
                />
                {r.label}
              </label>
            ))}
          </div>
        )}

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Note (optional)"
          className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none"
        />

        <DialogFooter>
          <button type="button" onClick={onClose} className="rounded-md border border-border px-3 py-2 text-sm">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            Confirm
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function IntakeCategoryDetail(props: Props) {
  return <CategoryPageContent {...props} />
}
