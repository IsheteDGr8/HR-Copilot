"use client"

import { Activity, ListTodo } from "lucide-react"
import {
  useAgentRuntime,
  fmtDuration,
  type EventCategory,
  type RunEvent,
} from "@/lib/agent-runtime"
import { CATEGORY_META, EventRow, ProgressBar, Section, StatusGlyph } from "@/components/agent-primitives"
import { cn } from "@/lib/utils"

/** Top-level events for a category (excludes sub-agent children). */
function useTopLevel(category: EventCategory): RunEvent[] {
  const { events } = useAgentRuntime()
  return events.filter((e) => e.category === category && !e.parentId)
}

function isLive(events: RunEvent[]) {
  return events.some((e) => e.status === "running")
}

function GenericSection({ category, defaultOpen = false }: { category: EventCategory; defaultOpen?: boolean }) {
  const { elapsedMs } = useAgentRuntime()
  const events = useTopLevel(category)
  const meta = CATEGORY_META[category]
  return (
    <Section
      icon={meta.icon}
      title={`${meta.label}s`}
      accent={meta.color}
      count={events.length}
      live={isLive(events)}
      defaultOpen={defaultOpen}
    >
      <div className="flex flex-col gap-0.5">
        {events.map((e) => (
          <EventRow key={e.id} event={e} elapsedMs={elapsedMs} />
        ))}
      </div>
    </Section>
  )
}

export function TasksSection() {
  const { events, elapsedMs } = useAgentRuntime()
  const tasks = events.filter((e) => e.category === "task")
  const live = isLive(tasks) || tasks.some((t) => (t.progress ?? 0) < 100)
  return (
    <Section
      icon={ListTodo}
      title="Task progress"
      accent="text-neutral-300"
      count={tasks.length}
      live={live && tasks.length > 0}
      defaultOpen
    >
      <div className="flex flex-col gap-2.5 px-2 py-1.5">
        {tasks.map((t) => {
          const pct = t.progress ?? 0
          const done = pct >= 100
          return (
            <div key={t.id} className="dream-fade flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <StatusGlyph status={done ? "success" : t.status === "error" ? "error" : "running"} />
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-neutral-200">{t.title}</span>
                <span
                  className={cn(
                    "shrink-0 text-[10.5px] tabular-nums",
                    done ? "text-neutral-400" : "text-neutral-300",
                  )}
                >
                  {pct}%
                </span>
              </div>
              <ProgressBar value={pct} />
            </div>
          )
        })}
      </div>
    </Section>
  )
}

export function SubAgentsSection() {
  const { events, elapsedMs } = useAgentRuntime()
  const subs = events.filter((e) => e.category === "subagent")
  const meta = CATEGORY_META.subagent
  return (
    <Section
      icon={meta.icon}
      title="Sub-agents"
      accent={meta.color}
      count={subs.length}
      live={isLive(subs) || subs.some((s) => events.some((c) => c.parentId === s.id && c.status === "running"))}
    >
      <div className="flex flex-col gap-2">
        {subs.map((sub) => {
          const children = events.filter((c) => c.parentId === sub.id)
          return (
            <div key={sub.id} className="dream-fade rounded-lg border border-border bg-white p-1.5">
              <EventRow event={sub} elapsedMs={elapsedMs} />
              {children.length > 0 && (
                <div className="ml-4 mt-1 flex flex-col gap-0.5 border-l border-border pl-2">
                  {children.map((c) => (
                    <EventRow key={c.id} event={c} elapsedMs={elapsedMs} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Section>
  )
}

export function LogsSection() {
  const { events } = useAgentRuntime()
  const logs = events.filter((e) => e.category === "log")
  const levelColor: Record<string, string> = {
    info: "text-muted-foreground",
    debug: "text-muted-foreground",
    warn: "text-warning",
    error: "text-destructive",
  }
  return (
    <Section icon={CATEGORY_META.log.icon} title="Logs" accent={CATEGORY_META.log.color} count={logs.length}>
      <div className="flex flex-col gap-0.5 rounded-lg bg-muted p-2 font-mono">
        {logs.map((l) => (
          <div key={l.id} className="dream-fade flex items-start gap-2 text-[11px] leading-relaxed">
            <span className="shrink-0 tabular-nums text-muted-foreground">{fmtDuration(l.startedAt)}</span>
            <span className={cn("shrink-0 uppercase", levelColor[l.level ?? "info"])}>{l.level ?? "info"}</span>
            <span className="min-w-0 flex-1 text-foreground">
              {l.title}
              {l.detail && <span className="text-muted-foreground"> — {l.detail}</span>}
            </span>
          </div>
        ))}
      </div>
    </Section>
  )
}

export function ErrorsSection() {
  const { events, elapsedMs } = useAgentRuntime()
  const items = events.filter((e) => e.category === "error" || e.category === "retry")
  const unresolved = items.some((e) => e.status === "error" || e.status === "running")
  return (
    <Section
      icon={CATEGORY_META.error.icon}
      title="Errors & retries"
      accent={unresolved ? "text-neutral-200" : "text-neutral-400"}
      count={items.length}
      live={items.some((e) => e.status === "running")}
    >
      <div className="flex flex-col gap-0.5">
        {items.map((e) => (
          <EventRow key={e.id} event={e} elapsedMs={elapsedMs} />
        ))}
      </div>
    </Section>
  )
}

/** Chronological feed of every activity event across the run. */
export function TimelineSection() {
  const { events, elapsedMs } = useAgentRuntime()
  const ordered = [...events].filter((e) => e.category !== "log").sort((a, b) => a.startedAt - b.startedAt)
  return (
    <Section
      icon={Activity}
      title="Execution timeline"
      accent="text-neutral-300"
      count={ordered.length}
      live={isLive(events)}
      defaultOpen
    >
      <div className="relative flex flex-col gap-0.5 pl-1">
        {ordered.map((e) => {
          const m = CATEGORY_META[e.category]
          const Icon = m.icon
          const dur = e.endedAt != null ? e.endedAt - e.startedAt : Math.max(0, elapsedMs - e.startedAt)
          return (
            <div key={e.id} className="dream-fade flex items-center gap-2.5 rounded-md px-2 py-1 hover:bg-secondary">
              <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                {fmtDuration(e.startedAt)}
              </span>
              <Icon className={cn("h-3.5 w-3.5 shrink-0", m.color)} />
              <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">{e.title}</span>
              <StatusGlyph status={e.status} />
              <span className="w-12 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                {fmtDuration(dur)}
              </span>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

export function StepsSection() {
  return <GenericSection category="step" defaultOpen />
}
export function SkillsSection() {
  return <GenericSection category="skill" />
}
export function ToolsSection() {
  return <GenericSection category="tool" defaultOpen />
}
export function McpSection() {
  return <GenericSection category="mcp" />
}
export function MemorySection() {
  return <GenericSection category="memory" />
}
export function DatabaseSection() {
  return <GenericSection category="database" />
}
export function FilesSection() {
  return <GenericSection category="file" />
}
export function ApiSection() {
  return <GenericSection category="api" />
}
