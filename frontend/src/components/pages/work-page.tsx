"use client"

import { useState } from "react"
import { Filter, Inbox, Loader2, Plus } from "lucide-react"
import { WorkRow } from "@/components/work-bits"
import { LegendPopover } from "@/components/hr-legend"
import { statusMeta, type WorkStatus } from "@/lib/hr-data"
import { useWorkQueue } from "@/lib/work-api"
import { useNavigation } from "@/lib/navigation"
import WorkDetail from "./work-detail"
import { PageContainer, PageHeader } from "@/components/management/shared"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type StatusFilter = WorkStatus | "all"

const filters: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All work" },
  { key: "needs_approval", label: statusMeta.needs_approval.label },
  { key: "running", label: statusMeta.running.label },
  { key: "queued", label: statusMeta.queued.label },
  { key: "blocked", label: statusMeta.blocked.label },
  { key: "completed", label: statusMeta.completed.label },
  { key: "failed", label: statusMeta.failed.label },
]

export default function WorkPage() {
  const nav = useNavigation()
  const { items, loading, error } = useWorkQueue()
  const [status, setStatus] = useState<StatusFilter>("all")

  if (nav.selectedWorkId) {
    return <WorkDetail workId={nav.selectedWorkId} />
  }

  const filtered = status === "all" ? items : items.filter((w) => w.status === status)

  return (
    <PageContainer>
      <PageHeader
        title="Work queue"
        icon={Inbox}
        description="Live agent runs — delegated tickets, onboarding, and ad hoc work."
        action={
          <div className="flex items-center gap-2">
            <LegendPopover variant="work" />
            <Button onClick={() => nav.setView("chat")} className="inline-flex items-center gap-2">
              <Plus className="size-4" />
              New task
            </Button>
          </div>
        }
      />

      <div className="dream-in">
        <div className="mb-4 flex flex-wrap gap-1.5">
          <Filter className="mr-1 size-3.5 self-center text-muted-foreground" />
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatus(f.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                status === f.key
                  ? "border-navy/30 bg-navy/10 font-semibold text-navy"
                  : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
          {loading && items.length === 0 ? (
            <p className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading work queue…
            </p>
          ) : error && items.length === 0 ? (
            <p className="py-12 text-center text-sm text-destructive">{error}</p>
          ) : filtered.length ? (
            filtered.map((item) => <WorkRow key={item.id} item={item} />)
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {status === "all"
                ? "No work items yet. Delegate an intake ticket or start a task in chat."
                : "No work items match this filter."}
            </p>
          )}
        </div>
      </div>
    </PageContainer>
  )
}
