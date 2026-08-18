"use client"

import { useEffect, useRef, useState } from "react"
import { Copy, Check, ThumbsDown, ThumbsUp } from "lucide-react"
import { ChatComposer } from "@/components/chat-composer"
import { AgentActivityFeed } from "@/components/agent-activity-feed"
import { MarkdownMessage } from "@/components/markdown-message"
import { useChat, type Message } from "@/lib/chat-store"
import { cn } from "@/lib/utils"

function MessageActions({ message }: { message: Message }) {
  const { reactToMessage } = useChat()
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard may be unavailable; ignore
    }
  }

  return (
    <div className="chat-msg-actions">
      <button
        aria-label="Good response"
        aria-pressed={message.reaction === "up"}
        onClick={() => reactToMessage(message.id, "up")}
        className={cn("chat-msg-action", message.reaction === "up" && "is-active")}
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>
      <button
        aria-label="Bad response"
        aria-pressed={message.reaction === "down"}
        onClick={() => reactToMessage(message.id, "down")}
        className={cn("chat-msg-action", message.reaction === "down" && "is-active")}
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>
      <button aria-label="Copy message" onClick={handleCopy} className="chat-msg-action">
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

export function ChatConversation() {
  const { activeConversation } = useChat()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" })
  }, [activeConversation.length, activeConversation[activeConversation.length - 1]?.content])

  if (!activeConversation) return null

  return (
    <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
      <AgentActivityFeed />

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="chat-thread">
          {activeConversation.map((message) => {
            const streaming = message.status === "receiving"

            if (message.role === "user") {
              return (
                <div key={message.id} className="chat-msg chat-msg-user">
                  <div className="chat-msg-user-bubble">{message.content}</div>
                </div>
              )
            }

            return (
              <div key={message.id} className="chat-msg chat-msg-assistant">
                <div className="chat-msg-assistant-body">
                  {message.content ? (
                    <MarkdownMessage content={message.content} />
                  ) : (
                    <p className="text-[15px] text-muted-foreground">Thinking…</p>
                  )}
                  {streaming && <span className="chat-stream-cursor" aria-hidden />}
                </div>
                {!streaming && <MessageActions message={message} />}
              </div>
            )
          })}
        </div>
      </div>

      <div className="chat-composer-dock">
        <ChatComposer />
      </div>
    </div>
  )
}
