"use client"

import { useEffect, useState } from "react"
import { X, ChevronDown, Link2, PanelLeftOpen } from "lucide-react"
import { toast } from "sonner"
import { ChatLanding } from "@/components/chat-landing"
import { ChatConversation } from "@/components/chat-conversation"
import { AgentExecutionPanel, AgentActivityToggle } from "@/components/agent-execution-panel"
import { SideCanvas, CanvasToggle } from "@/components/side-canvas"
import { ErrorBoundary } from "@/components/error-boundary"
import { OptionMenu } from "@/components/option-menu"
import { Button } from "@/components/ui/button"
import { useChat, MODELS } from "@/lib/chat-store"

interface ChatAreaProps {
  sidebarOpen: boolean
  onOpenSidebar: () => void
}

export function ChatArea({ sidebarOpen, onOpenSidebar }: ChatAreaProps) {
  const { activeConversation, newChat, model, setModel } = useChat()
  // This console is fully client-side (persisted chat state, live WebSocket,
  // Radix menus whose useId ids differ between SSR and the client). Rendering it
  // only after mount makes the server and first client render identical (both
  // the placeholder below), eliminating React hydration mismatches. There is no
  // SSR/SEO value to preserve here.
  const [mounted, setMounted] = useState(false)
  const inChat = activeConversation.length > 0

  useEffect(() => setMounted(true), [])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(typeof window !== "undefined" ? window.location.href : "")
      toast.success("Link copied to clipboard")
    } catch {
      toast.error("Could not copy link")
    }
  }

  // Server + first client render: a plain shell (no Radix/useId) so hydration
  // matches. The full console renders once mounted.
  if (!mounted) {
    return <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background" aria-hidden />
  }

  return (
    <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#F4F3EE] via-[#EEEDE6] to-[#F4F3EE]" />
      <div className="absolute inset-0 overflow-hidden">
        <div className="shader-orb shader-orb-1" />
        <div className="shader-orb shader-orb-2" />
        <div className="shader-orb shader-orb-3" />
      </div>
      <div className="grid-background absolute inset-0 opacity-[0.15]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03] mix-blend-soft-light"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between border-b border-border/50 px-6 py-4">
        <div className="flex items-center gap-3">
          {!sidebarOpen && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-foreground"
              onClick={onOpenSidebar}
              aria-label="Open sidebar"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </Button>
          )}

          {inChat ? (
            <div className="flex items-center gap-3">
              <button
                aria-label="Start a new chat"
                onClick={newChat}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-[11px] font-semibold text-white">
                C
              </span>
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold leading-tight text-foreground">HR Copilot</p>
                <p className="text-[11px] text-muted-foreground">Grounded in your HR systems</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-[11px] font-semibold text-white">
                C
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-semibold leading-tight text-foreground">HR Copilot</p>
                <p className="text-[11px] text-muted-foreground">Ask about people, policy, or today’s queue</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <CanvasToggle />
          <AgentActivityToggle />
          {inChat ? (
            <button
              aria-label="Copy link"
              onClick={copyLink}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Link2 className="h-4 w-4" />
            </button>
          ) : (
            <OptionMenu
              label="Model"
              options={MODELS.map((m) => m.label)}
              value={model}
              onChange={setModel}
              align="end"
              trigger={
                <Button className="gap-2 border border-border bg-white text-foreground shadow-sm hover:bg-secondary">
                  {model}
                  <ChevronDown className="h-4 w-4" />
                </Button>
              }
            />
          )}
        </div>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <ErrorBoundary label="chat">
            {inChat ? <ChatConversation /> : <ChatLanding />}
          </ErrorBoundary>
        </div>
        <ErrorBoundary label="Side Canvas">
          <SideCanvas />
        </ErrorBoundary>
        <AgentExecutionPanel />
      </div>
    </main>
  )
}
