"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, Loader2, PanelRightOpen } from "lucide-react"
import { useAgentRuntime, fmtClock, fmtDuration, STATUS_LABEL, type RunEvent } from "@/lib/agent-runtime"
import { CATEGORY_META, StatusGlyph } from "@/components/agent-primitives"
import { cn } from "@/lib/utils"

/**
 * Primary live activity feed. Pinned to the top of the conversation while the
 * agent works — every execution event streams in chronologically and is marked
 * complete in place. Monochrome to match the rest of the UI.
 */
export function AgentActivityFeed() {
  const { status, events, elapsedMs, isRunning, hasRun, setPanelOpen } = useAgentRuntime()
  const [collapsed, setCollapsed] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  // Chronological order; logs are surfaced in the detailed panel, not the feed.
  const ordered = useMemo(
    () => [...events].filter((e) => e.category !== "log").sort((a, b) => a.startedAt - b.startedAt),
    [events],
  )

  const done = ordered.filter((e) => e.status !== "running" && e.status !== "pending").length

  // Auto-scroll the feed to the newest event as the agent streams.
  useEffect(() => {
    if (collapsed) return
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [ordered.length, elapsedMs, collapsed])

  if (status === "idle" && !hasRun) return null

  return (
    <div className="dream-fade shrink-0 border-b border-border/60 bg-background/70 px-0 pt-3 backdrop-blur-md">
      <div className="chat-stage pb-3">
      <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-3.5 py-2.5">
          {isRunning ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-navy" />
          ) : (
            <span
              className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                status === "finished" ? "border-success/40 bg-success/15" : "border-border",
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", status === "finished" ? "bg-success" : "bg-navy")} />
            </span>
          )}

          <span className="text-[13px] font-semibold text-foreground">
            {isRunning ? "Agent working" : STATUS_LABEL[status]}
          </span>
          <span className="text-[12px] tabular-nums text-muted-foreground">
            {done}/{ordered.length} · {fmtClock(elapsedMs)}
          </span>

          <button
            onClick={() => setPanelOpen(true)}
            aria-label="Open full execution details"
            className="ml-auto rounded-md p-1 text-muted-foreground transition-colors hover:bg-black/[0.05] hover:text-foreground"
          >
            <PanelRightOpen className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Expand activity feed" : "Collapse activity feed"}
            aria-expanded={!collapsed}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-black/[0.05] hover:text-foreground"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform duration-300", collapsed && "-rotate-90")} />
          </button>
        </div>

        {/* Streaming feed */}
        {!collapsed && (
          <div
            ref={listRef}
            className="max-h-[240px] overflow-y-auto border-t border-border px-1.5 py-1.5"
          >
            <div className="relative pl-4">
              {/* vertical connector */}
              <span className="absolute bottom-3 left-[13px] top-3 w-px bg-border" aria-hidden />
              <div className="flex flex-col">
                {ordered.map((e) => (
                  <FeedRow key={e.id} event={e} elapsedMs={elapsedMs} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  )
}

function FeedRow({ event, elapsedMs }: { event: RunEvent; elapsedMs: number }) {
  const meta = CATEGORY_META[event.category]
  const Icon = meta.icon
  const running = event.status === "running"
  const dur = event.endedAt != null ? event.endedAt - event.startedAt : Math.max(0, elapsedMs - event.startedAt)

  return (
    <div className="dream-fade group relative flex items-start gap-2.5 rounded-md py-1.5 pl-2 pr-2 transition-colors hover:bg-black/[0.03]">
      {/* node marker on the timeline */}
      <span
        className={cn(
          "relative z-10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border bg-white",
          running ? "border-black/18" : "border-black/10",
        )}
      >
        <Icon className={cn("h-3 w-3", running ? "text-navy" : "text-muted-foreground")} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-600">{meta.label}</span>
          <span className="ml-auto flex items-center gap-2">
            <span className={cn("text-[10px] tabular-nums text-muted-foreground", running && "text-navy")}>
              {fmtDuration(dur)}
            </span>
            <StatusGlyph status={event.status} />
          </span>
        </div>
        <p
          className={cn(
            "truncate text-[12.5px] leading-tight",
            running ? "text-foreground" : event.status === "error" ? "text-destructive" : "text-foreground/80",
          )}
        >
          {event.title}
        </p>
        {event.detail && <p className="mt-0.5 truncate text-[11px] leading-tight text-neutral-500">{event.detail}</p>}
      </div>
    </div>
  )
}
