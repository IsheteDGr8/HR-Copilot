"use client"

import { useEffect, useState } from "react"
import { PanelLeftOpen } from "lucide-react"
import { AppSidebar } from "@/components/app-sidebar"
import { ChatArea } from "@/components/chat-area"
// TODO: restore once frontend/src/components/pages/mcp/page.tsx exists —
// only mcp-detail.tsx is present in that folder right now.
// import { McpConnectionsPage } from "@/components/pages/mcp/page"
import { SkillsPage } from "@/components/pages/skills/page"
// TODO: restore once frontend/src/components/pages/mcp/mcp-dialogs.tsx and
// mcp-types.ts exist — marketplace/page.tsx depends on both, and they're
// currently missing from that folder.
// import { MarketplaceDashboard } from "@/components/pages/marketplace/page"
import { MemoryPage } from "@/components/pages/memory-page"
import { SettingsPage } from "@/components/pages/settings-page"
import { ToolsPage } from "@/components/pages/tools-page"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useNavigation } from "@/lib/navigation"

const SIDEBAR_MIN_WIDTH = 240
const SIDEBAR_MAX_WIDTH = 420
const SIDEBAR_DEFAULT_WIDTH = 320

export function AppShell() {
  const { view } = useNavigation()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const next = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, e.clientX))
      setSidebarWidth(next)
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
  }, [isDragging])

  const isChat = view === "chat"

  return (
    <div className="fixed inset-0 bg-background p-5 flex items-center justify-center overflow-hidden">
      {/* Decorative background blobs, visible in the margin around the card */}
      <div
        className="pointer-events-none absolute -top-24 -left-24 h-80 w-80 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,107,74,0.18) 0%, transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute -bottom-32 -right-20 h-96 w-96 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(31,78,121,0.15) 0%, transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute top-1/3 right-1/4 h-56 w-56 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(245,166,35,0.12) 0%, transparent 70%)" }}
      />

      <div className="relative flex h-[calc(100vh-40px)] min-h-0 w-full max-w-[1400px] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      {view === "marketplace" ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Marketplace page is being rebuilt — check back soon.
        </div>
      ) : (
        <>
          <div
            style={{ width: sidebarOpen ? sidebarWidth : 0 }}
            className={cn(
              "shrink-0 overflow-hidden",
              !isDragging && "transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
            )}
          >
            <AppSidebar open={sidebarOpen} width={sidebarWidth} onCollapse={() => setSidebarOpen(false)} />
          </div>

          {/* Draggable divider */}
          {sidebarOpen && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize sidebar"
              onMouseDown={(e) => {
                e.preventDefault()
                setIsDragging(true)
              }}
              onDoubleClick={() => setSidebarWidth(SIDEBAR_DEFAULT_WIDTH)}
              className="group relative z-20 flex w-2 shrink-0 cursor-col-resize items-stretch justify-center"
            >
              <span
                className={cn(
                  "pointer-events-none h-full rounded-full transition-all duration-200",
                  isDragging ? "w-1 bg-white" : "w-px bg-transparent group-hover:w-1 group-hover:bg-white",
                )}
              />
            </div>
          )}

          {isChat ? (
            <ChatArea sidebarOpen={sidebarOpen} onOpenSidebar={() => setSidebarOpen(true)} />
          ) : (
            <main className="relative flex flex-1 flex-col overflow-hidden bg-background">
              {!sidebarOpen && (
                <div className="absolute left-4 top-4 z-20">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-foreground"
                    onClick={() => setSidebarOpen(true)}
                    aria-label="Open sidebar"
                  >
                    <PanelLeftOpen className="h-4 w-4" />
                  </Button>
                </div>
              )}
              {view === "mcp" && (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                  MCP Connections page is being rebuilt — check back soon.
                </div>
              )}
              {view === "tools" && <ToolsPage />}
              {view === "skills" && <SkillsPage />}
              {view === "memory" && <MemoryPage />}
              {view === "settings" && <SettingsPage />}
            </main>
          )}
        </>
      )}
      </div>
    </div>
  )
}
