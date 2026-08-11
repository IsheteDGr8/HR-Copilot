"use client"

import { LayoutPanelLeft, PanelRightClose, X } from "lucide-react"
import { useCanvas } from "@/lib/canvas-store"
import { CanvasModuleRenderer, MODULE_LABEL } from "@/components/canvas-modules"
import { cn } from "@/lib/utils"

/**
 * Right-hand Side Canvas: the second pane of the split screen. It surfaces the
 * structured result of the most recent HR tool call (employee profile, PTO,
 * org chart, benefits, policy) for the HR user to review. Read-only for now;
 * "Approve & Send" action cards arrive in Phase 4b.
 */
export function SideCanvas() {
  const open = useCanvas((s) => s.open)
  const artifacts = useCanvas((s) => s.artifacts)
  const activeId = useCanvas((s) => s.activeId)
  const setOpen = useCanvas((s) => s.setOpen)
  const select = useCanvas((s) => s.select)

  const active = artifacts.find((a) => a.id === activeId) ?? artifacts[0]

  return (
    <aside
      aria-hidden={!open}
      className={cn(
        "relative z-10 shrink-0 overflow-hidden border-l border-white/[0.06] transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
        open ? "w-[440px]" : "w-0",
      )}
    >
      <div className="flex h-full w-[440px] flex-col bg-[#0a0a0a]/85 backdrop-blur-xl">
        {/* Header */}
        <div className="shrink-0 border-b border-white/[0.06] px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <LayoutPanelLeft className="h-4 w-4 shrink-0 text-neutral-400" />
              <span className="truncate text-[13px] font-semibold text-neutral-100">
                {active ? active.title : "Side Canvas"}
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close side canvas"
              className="rounded-md p-1 text-neutral-500 transition-colors hover:bg-white/[0.06] hover:text-neutral-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Recent artifacts as switchable tabs */}
          {artifacts.length > 1 && (
            <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5">
              {artifacts.map((a) => (
                <button
                  key={a.id}
                  onClick={() => select(a.id)}
                  className={cn(
                    "shrink-0 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                    a.id === active?.id
                      ? "border-white/15 bg-white/[0.08] text-neutral-100"
                      : "border-white/[0.06] bg-white/[0.02] text-neutral-400 hover:bg-white/[0.05]",
                  )}
                  title={a.title}
                >
                  {MODULE_LABEL[a.module]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {active ? (
            <CanvasModuleRenderer artifact={active} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <LayoutPanelLeft className="h-8 w-8 text-neutral-700" />
              <p className="text-[13px] font-medium text-neutral-400">Nothing to review yet</p>
              <p className="text-[12px] text-neutral-600">
                Ask about an employee, PTO, benefits, the org chart, or a policy and the result
                appears here for review.
              </p>
            </div>
          )}
        </div>

        {/* Footer: read-only notice for data modules. Approval cards carry
            their own actions, so no footer there. */}
        {active && active.module !== "action_approval" && (
          <div className="shrink-0 border-t border-white/[0.06] px-4 py-2.5">
            <p className="text-[11px] text-neutral-500">
              Read-only view from <span className="text-neutral-400">{active.toolName}</span>.
            </p>
          </div>
        )}
      </div>
    </aside>
  )
}

/** Header toggle for the Side Canvas; badges the number of available modules. */
export function CanvasToggle() {
  const open = useCanvas((s) => s.open)
  const count = useCanvas((s) => s.artifacts.length)
  const toggle = useCanvas((s) => s.toggle)

  if (count === 0) return null

  return (
    <button
      onClick={toggle}
      aria-label="Toggle side canvas"
      aria-pressed={open}
      className={cn(
        "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[13px] font-medium transition-colors",
        open
          ? "border-white/15 bg-white/[0.08] text-neutral-100"
          : "border-white/10 bg-white/[0.03] text-neutral-300 hover:bg-white/[0.07]",
      )}
    >
      <PanelRightClose className="h-4 w-4" />
      <span className="hidden sm:inline">Canvas</span>
      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-white/10 px-1 text-[10px] tabular-nums text-neutral-300">
        {count}
      </span>
    </button>
  )
}
