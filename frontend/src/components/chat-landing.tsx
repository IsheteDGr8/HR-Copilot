"use client"

import { useState } from "react"
import { ClipboardList, LayoutDashboard, UserPlus, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ChatComposer } from "@/components/chat-composer"

const QUICK_ACTIONS = [
  { icon: LayoutDashboard, label: "Today's dashboard", prompt: "Show my dashboard" },
  { icon: UserPlus, label: "Start onboarding", prompt: "Help me onboard a new hire. " },
  { icon: Users, label: "Look up employee", prompt: "Look up employee " },
  { icon: ClipboardList, label: "Open tickets", prompt: "What's on my plate today?" },
]

export function ChatLanding() {
  const [prefill, setPrefill] = useState<{ text: string; nonce: number }>()

  const applyQuickAction = (prompt: string) => {
    setPrefill({ text: prompt, nonce: Date.now() })
  }

  return (
    <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-8">
        <div className="dream-in mb-6" style={{ animationDelay: "0.05s" }}>
          <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-white shadow-sm">
            <span className="text-2xl font-semibold text-navy">C</span>
          </span>
          <div className="mt-4 text-center">
            <div className="text-sm font-semibold tracking-[0.16em] text-foreground">CLOSED AI</div>
            <div className="mt-0.5 text-[11px] font-medium tracking-wider text-muted-foreground">HR COPILOT</div>
          </div>
        </div>

        <h1
          className="dream-in mb-3 max-w-2xl text-center font-[var(--font-heading)] text-3xl font-semibold tracking-tight text-foreground sm:text-4xl"
          style={{ animationDelay: "0.12s" }}
        >
          What can I help with today?
        </h1>
        <p
          className="dream-in mb-8 max-w-xl text-center text-sm leading-relaxed text-muted-foreground"
          style={{ animationDelay: "0.18s" }}
        >
          Look up people, draft transfers, screen applicants, or pull your HR dashboard — grounded in your company data.
        </p>

        <div className="mb-8 flex flex-wrap items-center justify-center gap-2.5">
          {QUICK_ACTIONS.map(({ icon: Icon, label, prompt }, i) => (
            <Button
              key={label}
              variant="secondary"
              onClick={() => applyQuickAction(prompt)}
              className="dream-in gap-2 rounded-full border border-border bg-white font-medium text-foreground shadow-sm hover:bg-secondary"
              style={{ animationDelay: `${0.22 + i * 0.06}s` }}
            >
              <Icon className="h-4 w-4 text-navy" />
              {label}
            </Button>
          ))}
        </div>
      </div>

      <div className="chat-composer-dock dream-in" style={{ animationDelay: "0.4s" }}>
        <ChatComposer prefill={prefill} />
      </div>
    </div>
  )
}
