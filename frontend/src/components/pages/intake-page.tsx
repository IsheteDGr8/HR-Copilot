"use client"

import { useState } from "react"
import { LayoutGrid, ListFilter, Loader2, Radar, ShieldCheck, Zap } from "lucide-react"
import { CategoryCard, IntakeRow } from "@/components/intake-bits"
import { deriveStats, dispositionMeta, openTickets, type IntakeDisposition } from "@/lib/intake-data"
import { useIntake } from "@/lib/intake-api"
import { useNavigation } from "@/lib/navigation"
import IntakeClusterDetail from "./intake-cluster-detail"
import { PageContainer, PageHeader } from "@/components/management/shared"
import { cn } from "@/lib/utils"
import { AiSummaryPanel } from "@/components/pages/ai-summary-panel"

type View = "decide" | "clusters" | "stream"

const views: { key: View; label: string; icon: typeof LayoutGrid }[] = [
  { key: "decide", label: "By decision", icon: Zap },
  { key: "clusters", label: "By cluster", icon: LayoutGrid },
  { key: "stream", label: "Full stream", icon: ListFilter },
]

const lanes: { key: IntakeDisposition; accent: string }[] = [
  { key: "human", accent: "border-t-warning" },
  { key: "assist", accent: "border-t-navy/60" },
  { key: "auto", accent: "border-t-success" },
]

export default function IntakePage() {
  const nav = useNavigation()
  const [view, setView] = useState<View>("decide")
  const { tickets, overview, categories, loading, error, reload, patchTicket } = useIntake()

  if (nav.selectedClusterId) {
    return (
      <IntakeClusterDetail
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
  const emerging = categories.filter((c) => c.open <= 2)
  const known = categories.filter((c) => c.open > 2)

  return (
    <PageContainer>
      <PageHeader
        title="Intake"
        icon={Radar}
        description="Everything arriving for HR, from every system and every channel. Sorted by the decision it needs from you — not by when it landed."
        action={
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
        }
      />

      {loading && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading intake…
        </div>
      )}

      {error && !loading && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="dream-in">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Arrived today" value={String(stats.arrivedToday)} sub="all channels" />
            <Stat
              label="Absorbed by Copilot"
              value={String(stats.autoAbsorbed)}
              sub="no human touch"
              tone="success"
            />
            <Stat
              label="Open for HR"
              value={String(stats.open)}
              sub={`${stats.needsJudgement} need your judgement`}
              tone="warning"
            />
            <Stat
              label="New patterns"
              value={String(stats.newPatterns)}
              sub="clusters with no playbook"
              tone="warning"
            />
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
                      <p className="mt-1 text-xs text-muted-foreground">{meta.blurb}</p>
                    </div>
                    {items.length ? (
                      items.map((item) => (
                        <div key={item.id} data-intake-id={item.id}>
                          <IntakeRow item={item} />
                        </div>
                      ))
                    ) : (
                      <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                        Nothing waiting here.
                      </p>
                    )}
                  </section>
                )
              })}
            </div>
          )}

          {view === "clusters" && (
            <>
              <div className="mt-6 flex items-center gap-2">
                <Radar className="size-4 text-warning" />
                <h2 className="text-sm font-semibold uppercase tracking-wider">Emerging — no playbook yet</h2>
                <p className="text-xs text-muted-foreground">
                  Grouped automatically from requests that didn&apos;t fit an existing category.
                </p>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {emerging.length ? (
                  emerging.map((c) => <CategoryCard key={c.id} category={c} count={c.open} />)
                ) : (
                  <p className="text-xs text-muted-foreground">No emerging patterns right now.</p>
                )}
              </div>

              <div className="mt-6 flex items-center gap-2">
                <ShieldCheck className="size-4 text-primary" />
                <h2 className="text-sm font-semibold uppercase tracking-wider">Known streams</h2>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {known.length ? (
                  known.map((c) => <CategoryCard key={c.id} category={c} count={c.open} />)
                ) : (
                  <p className="text-xs text-muted-foreground">No established category streams yet.</p>
                )}
              </div>
            </>
          )}

          {view === "stream" && (
            <div className="mt-6 overflow-hidden rounded-xl border border-border/60 bg-card">
              <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Newest first · every channel · {tickets.length} items
                </p>
                <p className="text-[11px] text-muted-foreground">Age</p>
              </div>
              {[...tickets]
                .sort((a, b) => a.ageMinutes - b.ageMinutes)
                .map((item) => (
                  <div key={item.id} data-intake-id={item.id}>
                    <IntakeRow item={item} dense />
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      <AiSummaryPanel pageContext={open} />
    </PageContainer>
  )
}

function Stat({
  label,
  value,
  sub,
  tone = "muted",
}: {
  label: string
  value: string
  sub: string
  tone?: "muted" | "success" | "warning"
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 transition-colors hover:border-border">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{label}</p>
      <p
        className={cn(
          "mt-1.5 text-2xl font-semibold",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
          tone === "muted" && "text-foreground",
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
    </div>
  )
}
