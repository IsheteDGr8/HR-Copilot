"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { History, LayoutPanelLeft, PanelRightClose, X } from "lucide-react"
import {
  useCanvas,
  CANVAS_DEFAULT_WIDTH,
  CANVAS_MAX_WIDTH,
  CANVAS_MIN_WIDTH,
  type CanvasModule,
} from "@/lib/canvas-store"
import { CanvasModuleRenderer, MODULE_LABEL } from "@/components/canvas-modules"
import { cn } from "@/lib/utils"

/** Modules with a sticky action footer at the bottom of their own layout. */
const FOOTER_MODULES = new Set<CanvasModule>([
  "helpdesk_ticket",
  "applicant_tracker",
  "recruiting_posting",
  "lifecycle_transfer",
  "onboarding_workflow",
  "onboarding_checklist",
  "hr_dashboard",
])

export function SideCanvas() {
  const open = useCanvas((s) => s.open)
  const width = useCanvas((s) => s.width)
  const artifacts = useCanvas((s) => s.artifacts)
  const activeId = useCanvas((s) => s.activeId)
  const setOpen = useCanvas((s) => s.setOpen)
  const setWidth = useCanvas((s) => s.setWidth)
  const select = useCanvas((s) => s.select)
  const [isDragging, setIsDragging] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const historyRef = useRef<HTMLDivElement>(null)

  const active = artifacts.find((a) => a.id === activeId) ?? artifacts[0]
  const hasFooterModule = active ? FOOTER_MODULES.has(active.module) : false
  const historyItems = useMemo(() => artifacts.slice(0, 8), [artifacts])

  useEffect(() => {
    if (!historyOpen) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (historyRef.current && !historyRef.current.contains(target)) setHistoryOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [historyOpen])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const next = Math.min(
        CANVAS_MAX_WIDTH,
        Math.max(CANVAS_MIN_WIDTH, window.innerWidth - e.clientX),
      )
      setWidth(next)
    }
    const stopDragging = () => setIsDragging(false)

    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", stopDragging)

    return () => {
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", stopDragging)
    }
  }, [isDragging, setWidth])

  return (
    <aside
      aria-hidden={!open}
      className={cn(
        "relative z-10 shrink-0 overflow-hidden border-l border-border bg-background/95",
        !isDragging && "transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
      )}
      style={{ width: open ? width : 0 }}
    >
      {/* Resize handle on the left edge */}
      {open && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize side canvas"
          onMouseDown={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDoubleClick={() => setWidth(CANVAS_DEFAULT_WIDTH)}
          className="absolute left-0 top-0 z-30 flex h-full w-2 -translate-x-1/2 cursor-col-resize items-stretch justify-center"
        >
          <span
            className={cn(
              "pointer-events-none h-full rounded-full transition-all duration-200",
              isDragging ? "w-1 bg-navy" : "w-px bg-transparent hover:w-1 hover:bg-navy/40",
            )}
          />
        </div>
      )}

      <div className="flex h-full flex-col" style={{ width }}>
        {/* Header */}
        <div className="shrink-0 border-b border-border px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <LayoutPanelLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-[13px] font-semibold text-foreground">
                {active ? active.title : "Side Canvas"}
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close side canvas"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {active && (
            <p className="mt-1 truncate text-[11px] text-muted-foreground">
              {MODULE_LABEL[active.module]}
            </p>
          )}

          {open && historyItems.length > 1 && (
            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                aria-label="Canvas history"
                onClick={() => setHistoryOpen((v) => !v)}
                className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <History className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Body — single scroll container so all modules are reachable */}
        <div
          className={cn(
            "min-h-0 flex-1 overscroll-contain",
            hasFooterModule ? "flex flex-col overflow-hidden" : "overflow-y-auto",
          )}
        >
          {active ? (
            hasFooterModule ? (
              <div className="flex h-full min-h-0 flex-col overflow-hidden">
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  <CanvasModuleRenderer artifact={active} />
                </div>
              </div>
            ) : (
              <div className="p-4">
                <CanvasModuleRenderer artifact={active} />
              </div>
            )
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <LayoutPanelLeft className="h-8 w-8 text-muted-foreground" />
              <p className="text-[13px] font-medium text-foreground">Nothing to review yet</p>
              <p className="text-[12px] text-muted-foreground">
                Ask about an employee, PTO, benefits, the org chart, or a policy and the result
                appears here for review.
              </p>
            </div>
          )}
        </div>

        {active && !hasFooterModule && active.module !== "action_approval" && (
          <div className="shrink-0 border-t border-border px-4 py-2.5">
            <p className="text-[11px] text-muted-foreground">
              Read-only view from <span className="font-medium text-foreground">{active.toolName}</span>.
            </p>
          </div>
        )}

        {/* History dropdown */}
        {open && historyOpen && historyItems.length > 1 && (
          <div ref={historyRef} className="absolute right-2 top-14 z-50 w-[280px] rounded-xl border border-border bg-white shadow-xl">
            <div className="px-3 py-2 text-[12px] font-semibold text-foreground">Canvas history</div>
            <div className="max-h-[240px] overflow-y-auto px-2 pb-2">
              {historyItems.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    setHistoryOpen(false)
                    select(a.id)
                  }}
                  className={[
                    "mb-1 w-full rounded-lg px-3 py-2 text-left text-[12.5px] transition-colors",
                    a.id === activeId ? "bg-secondary text-foreground" : "hover:bg-black/[0.04] text-foreground/90",
                  ].join(" ")}
                >
                  <div className="truncate font-medium">{a.title}</div>
                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{MODULE_LABEL[a.module]}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

/** Header toggle for the Side Canvas. */
export function CanvasToggle() {
  const open = useCanvas((s) => s.open)
  const count = useCanvas((s) => s.artifacts.length)
  const openLatestForContext = useCanvas((s) => s.openLatestForContext)
  const setOpen = useCanvas((s) => s.setOpen)

  if (count === 0) return null

  return (
    <button
      onClick={() => (open ? setOpen(false) : openLatestForContext())}
      aria-label="Toggle side canvas"
      aria-pressed={open}
      className={cn(
        "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[13px] font-medium transition-colors",
        open
          ? "border-border bg-secondary text-foreground"
          : "border-border bg-white text-muted-foreground shadow-sm hover:bg-secondary",
      )}
    >
      <PanelRightClose className="h-4 w-4" />
      <span className="hidden sm:inline">Canvas</span>
    </button>
  )
}
