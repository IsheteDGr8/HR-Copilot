"use client"

import { useEffect, useState } from "react"
import { X, ChevronDown, Link2, PanelLeftOpen, Settings, Upload } from "lucide-react"
import { toast } from "sonner"
import { ChatLanding } from "@/components/chat-landing"
import { ChatConversation } from "@/components/chat-conversation"
import { AgentExecutionPanel, AgentActivityToggle } from "@/components/agent-execution-panel"
import { SideCanvas, CanvasToggle } from "@/components/side-canvas"
import { ErrorBoundary } from "@/components/error-boundary"
import { OptionMenu } from "@/components/option-menu"
import { Button } from "@/components/ui/button"
import { useChat, MODELS } from "@/lib/chat-store"

const AGENTS = ["HR Agent", "Research Agent", "Writing Agent", "Support Agent"]
const CONFIG_OPTIONS = ["General Settings", "API Keys", "Preferences", "Advanced"]
const EXPORT_OPTIONS = ["Export as PDF", "Export as Markdown", "Export as JSON", "Share Link"]

interface ChatAreaProps {
  sidebarOpen: boolean
  onOpenSidebar: () => void
}

export function ChatArea({ sidebarOpen, onOpenSidebar }: ChatAreaProps) {
  const { activeConversation, newChat, model, setModel } = useChat()
  const [agent, setAgent] = useState(AGENTS[0])
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
                aria-label="Close chat"
                onClick={newChat}
                className="text-neutral-500 transition-colors hover:text-neutral-800"
              >
                <X className="h-4 w-4" />
              </button>
              <OptionMenu
                label="Switch agent"
                options={AGENTS}
                value={agent}
                onChange={setAgent}
                trigger={
                  <button className="flex items-center gap-2">
                    <span className="h-4 w-4 rounded-full border border-black/15 bg-neutral-700" />
                    <span className="text-[15px] font-medium text-neutral-800">{agent}</span>
                    <ChevronDown className="h-4 w-4 text-neutral-500" />
                  </button>
                }
              />
            </div>
          ) : (
            <OptionMenu
              label="Model"
              options={MODELS.map((m) => m.label)}
              value={model}
              onChange={setModel}
              trigger={
                <Button className="gap-2 border border-border/50 bg-secondary text-foreground backdrop-blur-sm transition-colors duration-300 hover:bg-secondary/70">
                  {model}
                  <ChevronDown className="h-4 w-4" />
                </Button>
              }
            />
          )}
        </div>

        <div className="flex items-center gap-2">
          <CanvasToggle />
          <AgentActivityToggle />
          {inChat ? (
            <>
              <button
                aria-label="Copy link"
                onClick={copyLink}
                className="text-neutral-500 transition-colors hover:text-neutral-800"
              >
                <Link2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => toast("Edit mode", { description: "Agent editing is not wired up yet." })}
                className="rounded-md border border-black/10 bg-black/[0.03] px-3 py-1.5 text-[13px] font-medium text-neutral-800 transition-colors hover:bg-black/[0.06]"
              >
                Edit
              </button>
              <button
                onClick={() => toast.success("Agent published", { description: `${agent} is now live.` })}
                className="rounded-md border border-black/10 bg-black/[0.05] px-3 py-1.5 text-[13px] font-medium text-neutral-800 transition-colors hover:bg-black/[0.08]"
              >
                Publish agent
              </button>
            </>
          ) : (
            <>
              <OptionMenu
                label="Configuration"
                options={CONFIG_OPTIONS}
                value=""
                onChange={(v) => toast(v, { description: "Opening configuration panel." })}
                align="end"
                trigger={
                  <Button className="gap-2 border border-border/50 bg-secondary text-foreground backdrop-blur-sm transition-colors duration-300 hover:bg-secondary/70">
                    <Settings className="h-4 w-4" />
                    Configuration
                  </Button>
                }
              />
              <OptionMenu
                label="Export"
                options={EXPORT_OPTIONS}
                value=""
                onChange={(v) => toast.success(v, { description: "Your conversation is being prepared." })}
                align="end"
                trigger={
                  <Button className="gap-2 border border-border/50 bg-secondary text-foreground backdrop-blur-sm transition-colors duration-300 hover:bg-secondary/70">
                    <Upload className="h-4 w-4" />
                    Export
                  </Button>
                }
              />
            </>
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
