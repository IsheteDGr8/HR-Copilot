"use client"

import { useState } from "react"
import { ImageIcon, Lightbulb, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ChatComposer } from "@/components/chat-composer"

const QUICK_ACTIONS = [
  { icon: ImageIcon, label: "Create Image", prompt: "Create an image of " },
  { icon: Lightbulb, label: "Brainstorm", prompt: "Help me brainstorm ideas about " },
  { icon: FileText, label: "Make a plan", prompt: "Make a plan for " },
]

export function ChatLanding() {
  const [prefill, setPrefill] = useState<{ text: string; nonce: number }>()

  const applyQuickAction = (prompt: string) => {
    setPrefill({ text: prompt, nonce: Date.now() })
  }

  return (
    <div className="relative z-10 flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-6">
      <div className="dream-in mb-6" style={{ animationDelay: "0.05s" }}>
        <span className="relative flex h-20 w-20 items-center justify-center rounded-full border-2 border-foreground/70">
          <span className="text-3xl font-semibold text-foreground">C</span>
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 80 80">
            <circle cx="40" cy="4" r="4" fill="#FF6B4A">
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0 40 40"
                to="360 40 40"
                dur="6s"
                repeatCount="indefinite"
              />
            </circle>
          </svg>
        </span>
        <div className="mt-3 text-center">
          <div className="text-base font-semibold tracking-[0.15em] text-foreground">CLOSED AI</div>
          <div className="mt-0.5 text-[11px] font-medium tracking-wider text-muted-foreground">HR COPILOT</div>
        </div>
      </div>

      <h1
        className="dream-in mb-8 text-center font-[var(--font-heading)] text-4xl font-semibold tracking-tight text-foreground text-balance"
        style={{ animationDelay: "0.15s" }}
      >
        Ready to Create Something New?
      </h1>

      <div className="mb-8 flex flex-wrap items-center justify-center gap-3">
        {QUICK_ACTIONS.map(({ icon: Icon, label, prompt }, i) => (
          <Button
            key={label}
            variant="secondary"
            onClick={() => applyQuickAction(prompt)}
            className="dream-in gap-2 bg-secondary font-medium text-secondary-foreground transition-colors duration-300 hover:bg-foreground hover:text-background"
            style={{ animationDelay: `${0.25 + i * 0.08}s` }}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Button>
        ))}
      </div>

      <div className="dream-in w-full" style={{ animationDelay: "0.5s" }}>
        <ChatComposer prefill={prefill} />
      </div>
    </div>
  )
}
