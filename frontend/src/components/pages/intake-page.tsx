"use client"

import { useState } from "react"
import { LayoutGrid, ListFilter, Loader2, Radar, Zap } from "lucide-react"
import { CategoryCard, IntakeRow } from "@/components/intake-bits"
import { LegendPopover } from "@/components/hr-legend"
import { dispositionMeta, deriveStats, openTickets, type IntakeDisposition } from "@/lib/intake-data"
import { useIntake } from "@/lib/intake-api"
import { useNavigation } from "@/lib/navigation"
import IntakeCategoryDetail from "./intake-cluster-detail"
import { PageContainer, PageHeader } from "@/components/management/shared"
import { cn } from "@/lib/utils"

type View = "decide" | "categories" | "stream"

const views: { key: View; label: string; icon: typeof LayoutGrid }[] = [
  { key: "decide", label: "By decision", icon: Zap },
  { key: "categories", label: "By category", icon: LayoutGrid },
  { key: "stream", label: "Full stream", icon: ListFilter },
]

const lanes: { key: IntakeDisposition; accent: string }[] = [
  { key: "human", accent: "border-t-warning" },
  { key: "assist", accent: "border-t-navy/60" },
  { key: "auto", accent: "border-t-success" },
]

export default function IntakePage() {
  const nav = useNavigation()
  const { tickets, overview, categories, loading, error, reload, patchTicket } = useIntake()
  const [view, setView] = useState<View>("decide")

  if (nav.selectedClusterId) {
    if (loading) {
      return (
        <PageContainer>
          <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading…
          </div>
        </PageContainer>
      )
    }
    return (
      <IntakeCategoryDetail
        categoryId={nav.selectedClusterId}
        tickets={tickets}
        categories={categories}
        patchTicket={patchTicket}
        reload={reload}
      />
    )
  }

  const open = openTickets(tickets)
  const stats = deriveStats(overview, tickets)

  return (
    <PageContainer>
      <PageHeader
        title="Intake"
        icon={Radar}
        description="HR requests from every channel — sorted by the decision they need."
        action={
          <div className="flex items-center gap-2">
            <LegendPopover variant="intake" />
            <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-card p-1">
            {views.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => setView(v.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground",
                  view === v.key && "bg-secondary font-semibold text-foreground",
                )}
              >
                <v.icon className="size-3.5" />
                {v.label}
              </button>
            ))}
            </div>
          </div>
        }
      />

      <div className="dream-in">
        {loading ? (
          <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading intake…
          </div>
        ) : error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Today" value={String(stats.arrivedToday)} />
              <Stat label="Auto-handled" value={String(stats.autoAbsorbed)} tone="success" />
              <Stat label="Open" value={String(stats.open)} tone="warning" />
              <Stat label="Needs you" value={String(stats.needsJudgement)} tone="warning" />
            </div>

            {view === "decide" && (
              <div className="mt-6 grid gap-4 lg:grid-cols-3">
                {lanes.map((lane) => {
                  const meta = dispositionMeta[lane.key]
                  const items = open.filter((i) => i.disposition === lane.key)
                  return (
                    <section
                      key={lane.key}
                      className={cn(
                        "overflow-hidden rounded-xl border border-t-2 border-border/60 bg-card",
                        lane.accent,
                      )}
                    >
                      <div className="border-b border-border/60 px-4 py-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold">{meta.label}</p>
                          <span className="rounded-md border border-border/60 bg-secondary/60 px-2 py-0.5 font-mono text-xs font-medium text-muted-foreground">
                            {items.length}
                          </span>
                        </div>
                      </div>
                      {items.length ? (
                        items.map((item) => <IntakeRow key={item.id} item={item} />)
                      ) : (
                        <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                          Nothing here.
                        </p>
                      )}
                    </section>
                  )
                })}
              </div>
            )}

            {view === "categories" && (
              <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {categories.map((c) => (
                  <CategoryCard
                    key={c.id}
                    category={c}
                    count={open.filter((i) => i.category === c.label).length}
                  />
                ))}
              </div>
            )}

            {view === "stream" && (
              <div className="mt-6 overflow-hidden rounded-xl border border-border/60 bg-card">
                <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    Newest first · {tickets.length} items
                  </p>
                </div>
                {[...tickets]
                  .sort((a, b) => a.ageMinutes - b.ageMinutes)
                  .map((item) => (
                    <IntakeRow key={item.id} item={item} dense />
                  ))}
              </div>
            )}
          </>
        )}
      </div>
    </PageContainer>
  )
}

function Stat({
  label,
  value,
  tone = "muted",
}: {
  label: string
  value: string
  tone?: "muted" | "success" | "warning"
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
          tone === "muted" && "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  )
}
