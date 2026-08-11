"use client"

import { useEffect, useRef, useState } from "react"
import { ThumbsUp, ThumbsDown, Copy, Check } from "lucide-react"
import { ChatComposer } from "@/components/chat-composer"
import { AgentActivityFeed } from "@/components/agent-activity-feed"
import { useChat, formatRelativeTime, type Message } from "@/lib/chat-store"
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
    <div className="mt-1 flex items-center gap-3 text-neutral-500">
      <button
        aria-label="Good response"
        aria-pressed={message.reaction === "up"}
        onClick={() => reactToMessage(message.id, "up")}
        className={cn("transition-colors hover:text-neutral-200", message.reaction === "up" && "text-neutral-100")}
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>
      <button
        aria-label="Bad response"
        aria-pressed={message.reaction === "down"}
        onClick={() => reactToMessage(message.id, "down")}
        className={cn("transition-colors hover:text-neutral-200", message.reaction === "down" && "text-neutral-100")}
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>
      <button
        aria-label="Copy message"
        onClick={handleCopy}
        className="transition-colors hover:text-neutral-200"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-neutral-200" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

export function ChatConversation() {
  const { activeConversation, reactToMessage } = useChat()
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [activeConversation.length])

  if (!activeConversation) return null

  return (
    <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
      {/* Live activity feed — pinned above the conversation while the agent works */}
      <AgentActivityFeed />

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[680px] flex-col gap-6 px-6 py-8">
          <div className="text-center text-[11px] font-medium uppercase tracking-wide text-neutral-500">Today</div>

          {activeConversation.map((message) => {
            const createdAt = message.createdAt ?? message.timestamp?.getTime?.() ?? Date.now()
            return message.role === "user" ? (
              <div key={message.id} className="msg-in flex flex-col items-end gap-1.5">
                <div className="flex items-center gap-2 text-[12px]">
                  <span className="font-semibold text-neutral-200">Me</span>
                  <span className="text-neutral-500">{formatRelativeTime(createdAt)}</span>
                </div>
                <div className="max-w-[85%] rounded-xl rounded-tr-sm bg-[#161616] px-3.5 py-2.5 text-[13.5px] leading-relaxed text-neutral-200 text-pretty">
                  {message.content}
                </div>
              </div>
            ) : (
              <div key={message.id} className="msg-in flex flex-col items-start gap-1.5">
                <div className="flex items-center gap-2 text-[12px]">
                  <span className="font-semibold text-neutral-200">HR Agent</span>
                  <span className="text-neutral-500">{formatRelativeTime(createdAt)}</span>
                </div>
                <p className="max-w-[90%] text-[13.5px] leading-relaxed text-neutral-300 text-pretty">
                  {message.content}
                </p>
                <MessageActions message={message} />
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Composer */}
      <div className="px-6 pb-4">
        <ChatComposer />
        <p className="mt-3 text-center text-[11px] text-neutral-600">
          Luminar is still training models. Please help us improve the results.
        </p>
      </div>
    </div>
  )
}
