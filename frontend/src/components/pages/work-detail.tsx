"use client"

import type { ReactNode } from "react"
import { ArrowLeft, MessageSquare, TicketCheck } from "lucide-react"
import { SourceTag, StatusPill, formatWorkTime } from "@/components/work-bits"
import { getAutomation, type WorkItem } from "@/lib/hr-data"
import { useWorkQueue } from "@/lib/work-api"
import { useChat } from "@/lib/chat-store"
import { useNavigation } from "@/lib/navigation"
import { cn } from "@/lib/utils"

export default function WorkDetail({ workId: propWorkId }: { workId?: string }) {
  const nav = useNavigation()
  const { items, loading } = useWorkQueue()
  const selectConversation = useChat((s) => s.selectConversation)
  const targetId = propWorkId || nav.selectedWorkId
  const item = items.find((w) => w.id === targetId) as WorkItem | undefined
  const automation = item?.automation ? getAutomation(item.automation) : undefined

  const handleBack = () => {
    nav.setSelectedWorkId(null)
    nav.setView("work")
  }

  const openChat = () => {
    if (!item?.linkedChatId) return
    selectConversation(item.linkedChatId)
    nav.setView("chat")
  }

  if (loading && !item) {
    return (
      <div className="dream-in px-6 py-12 text-sm text-muted-foreground">Loading work item…</div>
    )
  }

  if (!item) {
    return (
      <div className="dream-in px-6 py-12">
        <button type="button" onClick={handleBack} className="text-sm text-primary hover:underline">
          Back to work queue
        </button>
        <p className="mt-4 text-sm text-muted-foreground">This work item was not found.</p>
      </div>
    )
  }

  return (
    <div className="dream-in flex h-[calc(100vh-49px)] min-w-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 md:px-6">
        <button
          type="button"
          onClick={handleBack}
          className="flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-sidebar-accent"
          aria-label="Back to work queue"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-muted-foreground">{item.id}</span>
            <SourceTag source={item.source} />
          </div>
          <h1 className="truncate text-sm font-semibold">{item.title}</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <StatusPill status={item.status} />
          <span className="text-xs text-muted-foreground">
            {formatWorkTime(item.updatedAt || item.updated)}
          </span>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-y-auto lg:grid-cols-[1fr_280px]">
        <section className="space-y-4 p-4 md:p-6">
          <div className="rounded-lg border border-border bg-white p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-md bg-sidebar-accent text-sm font-semibold">
                {item.subject.initials}
              </div>
              <div>
                <p className="text-sm font-semibold">{item.subject.name}</p>
                <p className="text-xs text-muted-foreground">{item.subject.role || item.category}</p>
              </div>
            </div>
            {item.summary && (
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{item.summary}</p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {item.linkedChatId && (
                <button
                  type="button"
                  onClick={openChat}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
                >
                  <MessageSquare className="size-3.5" />
                  Open chat
                </button>
              )}
              {item.linkedTicketId && (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground">
                  <TicketCheck className="size-3.5" />
                  Ticket {item.linkedTicketId}
                </span>
              )}
            </div>
          </div>
        </section>

        <aside className="border-t border-border p-4 lg:border-l lg:border-t-0">
          <p className="label-caps">Run</p>
          <div className="mt-2 space-y-2 text-xs">
            <Row k="Status" v={<StatusPill status={item.status} />} />
            <Row k="Source" v={item.externalRef || item.source} />
            <Row k="Automation" v={automation ? automation.name : "None (ad hoc)"} />
            <Row k="Priority" v={item.priority} />
            <Row k="Updated" v={formatWorkTime(item.updatedAt || item.updated) || "—"} />
          </div>

          <p className="label-caps mt-6">Progress</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full",
                item.status === "blocked" || item.status === "failed" ? "bg-destructive" : "bg-primary",
              )}
              style={{ width: `${item.progress}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{item.progress}% complete</p>
        </aside>
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right capitalize">{v}</span>
    </div>
  )
}
