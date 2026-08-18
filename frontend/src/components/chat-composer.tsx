"use client"

import { useEffect, useRef, useState } from "react"
import {
  Plus,
  Database,
  ChevronDown,
  Sparkles,
  Mic,
  SendHorizontal,
  Command,
  Paperclip,
  ImageIcon,
  Globe,
  Check,
  X,
  Square,
} from "lucide-react"
import { OptionMenu } from "@/components/option-menu"
import { VoiceRecorder } from "@/components/voice-recorder"
import { useChat, MODELS, TONES, DATA_SOURCES } from "@/lib/chat-store"
import { useAgentRuntime } from "@/lib/agent-runtime"
import { cn } from "@/lib/utils"

interface ChatComposerProps {
  /** When this changes, the composer input is replaced with `text` and focused. */
  prefill?: { text: string; nonce: number }
}

export function ChatComposer({ prefill }: ChatComposerProps) {
  const {
    sendMessage,
    model,
    setModel,
    tone,
    setTone,
    dataSource,
    setDataSource,
    webSearch,
    toggleWebSearch,
    isRunning,
  } = useChat()
  const { startRun, stopRun } = useAgentRuntime()
  const [input, setInput] = useState("")
  const [attachOpen, setAttachOpen] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [attachments, setAttachments] = useState<string[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!attachOpen) return
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setAttachOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [attachOpen])

  // Apply an external prefill (e.g. from landing-page quick actions).
  useEffect(() => {
    if (!prefill) return
    setInput(prefill.text)
    const el = textareaRef.current
    if (el) {
      el.focus()
      const end = prefill.text.length
      el.setSelectionRange(end, end)
    }
  }, [prefill])

  // Auto-grow the textarea.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, 200) + "px"
  }, [input])

  const handleSend = () => {
    if (!input.trim() || isRunning) return
    startRun(input.trim())
    sendMessage(input)
    setInput("")
    setAttachments([])
  }

  const handleStop = () => {
    stopRun()
    textareaRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if ((e.key === "Enter" && !e.shiftKey) || (e.key === "/" && (e.metaKey || e.ctrlKey))) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="relative">
      {isRecording && (
        <div className="mx-auto max-w-[680px]">
          <VoiceRecorder
            onCancel={() => setIsRecording(false)}
            onConfirm={(t) => {
              setInput((prev) => (prev ? prev + " " + t : t))
              setIsRecording(false)
              textareaRef.current?.focus()
            }}
          />
        </div>
      )}

      {/* Attachment menu */}
      {attachOpen && (
        <div
          ref={menuRef}
          className="dream-fade absolute bottom-full left-1/2 z-20 mb-2 w-60 -translate-x-[calc(50%+230px)] rounded-xl border border-black/10 bg-white p-1.5 shadow-2xl"
        >
          <button
            onClick={() => {
              fileInputRef.current?.click()
              setAttachOpen(false)
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-neutral-700 transition-colors hover:bg-black/[0.05]"
          >
            <Paperclip className="h-4 w-4 text-neutral-600" />
            Add photos and files
          </button>
          <button
            onClick={() => {
              setInput((p) => (p ? p : "Create an image of "))
              setAttachOpen(false)
              textareaRef.current?.focus()
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-neutral-700 transition-colors hover:bg-black/[0.05]"
          >
            <ImageIcon className="h-4 w-4 text-neutral-600" />
            Create Images
          </button>
          <button
            onClick={() => {
              toggleWebSearch()
              setAttachOpen(false)
            }}
            className="flex w-full items-center justify-between gap-2.5 rounded-lg px-3 py-2 text-[13px] text-neutral-700 transition-colors hover:bg-black/[0.05]"
          >
            <span className="flex items-center gap-2.5">
              <Globe className="h-4 w-4 text-neutral-600" />
              Web search
            </span>
            {webSearch && <Check className="h-3.5 w-3.5 text-neutral-700" />}
          </button>
        </div>
      )}

      <div className="input-3d mx-auto max-w-[680px] rounded-xl border border-black/12 bg-white p-3">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const names = Array.from(e.target.files ?? []).map((f) => f.name)
            if (names.length) setAttachments((prev) => [...prev, ...names])
            e.target.value = ""
          }}
        />

        {/* Top row */}
        <div className="flex items-center justify-between">
          <button
            aria-label="Add attachment"
            onClick={() => setAttachOpen((v) => !v)}
            className={cn(
              "text-neutral-600 transition-colors hover:text-neutral-800",
              attachOpen && "text-neutral-800",
            )}
          >
            <Plus className="h-5 w-5" />
          </button>

          <OptionMenu
            label="Data source"
            options={DATA_SOURCES}
            value={dataSource}
            onChange={setDataSource}
            align="end"
            trigger={
              <button className="flex items-center gap-1.5 rounded-md border border-black/10 bg-black/[0.03] px-2.5 py-1 text-[12px] font-medium text-neutral-700 transition-colors hover:bg-black/[0.06]">
                <Database className="h-3.5 w-3.5" />
                {dataSource}
                <ChevronDown className="h-3.5 w-3.5 text-neutral-600" />
              </button>
            }
          />
        </div>

        {/* Attachment chips */}
        {(attachments.length > 0 || webSearch) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {webSearch && (
              <span className="flex items-center gap-1.5 rounded-md border border-black/12 bg-black/[0.05] px-2 py-1 text-[11px] text-neutral-600">
                <Globe className="h-3 w-3" />
                Web search on
                <button aria-label="Turn off web search" onClick={toggleWebSearch}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {attachments.map((name, i) => (
              <span
                key={i}
                className="flex items-center gap-1.5 rounded-md border border-black/10 bg-black/[0.04] px-2 py-1 text-[11px] text-neutral-600"
              >
                <Paperclip className="h-3 w-3" />
                {name}
                <button
                  aria-label={`Remove ${name}`}
                  onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          className="mt-2 max-h-[200px] w-full resize-none bg-transparent text-[14px] leading-relaxed text-neutral-900 outline-none placeholder:text-neutral-600"
          placeholder="Message HR Agent..."
        />

        {/* Bottom row */}
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <OptionMenu
              label="Model"
              options={MODELS.map((m) => m.label)}
              value={model}
              onChange={setModel}
              side="top"
              trigger={
                <button className="flex items-center gap-1.5 rounded-md border border-black/10 bg-black/[0.03] px-2.5 py-1 text-[12px] font-medium text-neutral-700 transition-colors hover:bg-black/[0.06]">
                  <Sparkles className="h-3.5 w-3.5 text-neutral-600" />
                  {model}
                  <ChevronDown className="h-3.5 w-3.5 text-neutral-600" />
                </button>
              }
            />
            <OptionMenu
              label="Tone"
              options={TONES}
              value={tone}
              onChange={setTone}
              side="top"
              trigger={
                <button className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] font-medium text-neutral-600 transition-colors hover:text-neutral-800">
                  <span className="flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-neutral-500 text-[9px]">
                    T
                  </span>
                  {tone === "Default" ? "Tone" : tone}
                  <ChevronDown className="h-3.5 w-3.5 text-neutral-600" />
                </button>
              }
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              aria-label="Voice input"
              onClick={() => setIsRecording(true)}
              className="text-neutral-600 transition-colors hover:text-neutral-800"
            >
              <Mic className="h-4 w-4" />
            </button>
            {isRunning ? (
              <button
                onClick={handleStop}
                aria-label="Stop generation"
                title="Stop the current run"
                className="btn-3d flex items-center gap-2 rounded-md border border-black/15 bg-gradient-to-br from-red-500 to-red-600 px-3 py-1.5 text-[13px] font-medium text-white shadow-xl transition-all hover:from-red-600 hover:to-red-500"
              >
                <Square className="h-3.5 w-3.5" />
                Stop
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="btn-3d btn-glow flex items-center gap-2 rounded-md border border-black/15 bg-gradient-to-br from-[#FF6B4A] to-[#F5834F] px-3 py-1.5 text-[13px] font-medium text-white shadow-xl transition-all hover:from-[#F5834F] hover:to-[#FF6B4A] disabled:opacity-40"
              >
                <SendHorizontal className="h-3.5 w-3.5" />
                Send
                <span className="flex items-center gap-0.5 text-neutral-600">
                  <Command className="h-3 w-3" />
                  <span className="text-[12px]">/</span>
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
