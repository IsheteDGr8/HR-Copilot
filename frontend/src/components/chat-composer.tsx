"use client"

import { useEffect, useRef, useState } from "react"
import {
  Plus,
  Database,
  ChevronDown,
  Sparkles,
  Mic,
  ArrowUp,
  Paperclip,
  ImageIcon,
  Globe,
  Check,
  X,
  Square,
  SlidersHorizontal,
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
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [attachments, setAttachments] = useState<File[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const attachRef = useRef<HTMLDivElement>(null)
  const settingsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!attachOpen && !settingsOpen) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (attachOpen && attachRef.current && !attachRef.current.contains(target)) setAttachOpen(false)
      if (settingsOpen && settingsRef.current && !settingsRef.current.contains(target)) setSettingsOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [attachOpen, settingsOpen])

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

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, 200) + "px"
  }, [input])

  const canSend = !isRunning && (input.trim().length > 0 || attachments.length > 0)

  const handleSend = () => {
    if (!canSend) return
    startRun(input.trim())
    // Backend accepts a single `file` field; use the first attached file.
    const file = attachments.length > 0 ? attachments[0] : null
    sendMessage(input, file)
    setInput("")
    setAttachments([])
  }

  const handleStop = () => {
    stopRun()
    textareaRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (canSend) handleSend()
    }
  }

  return (
    <div className="chat-composer">
      {isRecording && (
        <div className="mb-3">
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

      {(attachments.length > 0 || webSearch) && (
        <div className="mb-2 flex flex-wrap gap-2 px-1">
          {webSearch && (
            <span className="chat-composer-chip">
              <Globe className="h-3 w-3" />
              Web search
              <button aria-label="Turn off web search" onClick={toggleWebSearch}>
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {attachments.map((file, i) => (
            <span key={i} className="chat-composer-chip">
              <Paperclip className="h-3 w-3" />
              <span className="max-w-[140px] truncate">{file.name}</span>
              <button
                aria-label={`Remove ${file.name}`}
                onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="chat-composer-shell">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            if (files.length) setAttachments((prev) => [...prev, ...files])
            e.target.value = ""
          }}
        />

        {attachOpen && (
          <div ref={attachRef} className="chat-composer-popover">
            <button
              onClick={() => {
                fileInputRef.current?.click()
                setAttachOpen(false)
              }}
              className="chat-composer-popover-item"
            >
              <Paperclip className="h-4 w-4" />
              Add photos and files
            </button>
            <button
              onClick={() => {
                setInput((p) => (p ? p : "Create an image of "))
                setAttachOpen(false)
                textareaRef.current?.focus()
              }}
              className="chat-composer-popover-item"
            >
              <ImageIcon className="h-4 w-4" />
              Create images
            </button>
            <button
              onClick={() => {
                toggleWebSearch()
                setAttachOpen(false)
              }}
              className="chat-composer-popover-item justify-between"
            >
              <span className="flex items-center gap-2.5">
                <Globe className="h-4 w-4" />
                Web search
              </span>
              {webSearch && <Check className="h-3.5 w-3.5" />}
            </button>
          </div>
        )}

        {settingsOpen && (
          <div ref={settingsRef} className="chat-composer-settings">
            <OptionMenu
              label="Model"
              options={MODELS.map((m) => m.label)}
              value={model}
              onChange={setModel}
              side="top"
              trigger={
                <button className="chat-composer-settings-row">
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 text-left">Model</span>
                  <span className="text-muted-foreground">{model}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
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
                <button className="chat-composer-settings-row">
                  <span className="flex h-4 w-4 items-center justify-center rounded-sm border border-neutral-400 text-[9px] text-muted-foreground">
                    T
                  </span>
                  <span className="flex-1 text-left">Tone</span>
                  <span className="text-muted-foreground">{tone === "Default" ? "Default" : tone}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              }
            />
            <OptionMenu
              label="Data source"
              options={DATA_SOURCES}
              value={dataSource}
              onChange={setDataSource}
              side="top"
              trigger={
                <button className="chat-composer-settings-row">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 text-left">Data source</span>
                  <span className="max-w-[120px] truncate text-muted-foreground">{dataSource}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              }
            />
          </div>
        )}

        <div className="chat-composer-row">
          <button
            aria-label="Add attachment"
            onClick={() => {
              setSettingsOpen(false)
              setAttachOpen((v) => !v)
            }}
            className={cn("chat-composer-icon-btn", attachOpen && "is-active")}
          >
            <Plus className="h-5 w-5" />
          </button>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            className="chat-composer-input"
            placeholder="Message HR Copilot"
          />

          <button
            aria-label="Composer settings"
            onClick={() => {
              setAttachOpen(false)
              setSettingsOpen((v) => !v)
            }}
            className={cn("chat-composer-icon-btn hidden sm:flex", settingsOpen && "is-active")}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>

          <button
            aria-label="Voice input"
            onClick={() => setIsRecording(true)}
            className="chat-composer-icon-btn"
          >
            <Mic className="h-4 w-4" />
          </button>

          {isRunning ? (
            <button
              onClick={handleStop}
              aria-label="Stop generation"
              className="chat-composer-send is-stop"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!canSend}
              aria-label="Send message"
              className={cn("chat-composer-send", canSend && "is-ready")}
            >
              <ArrowUp className="h-4 w-4 stroke-[2.5]" />
            </button>
          )}
        </div>
      </div>

      <p className="chat-composer-hint">
        HR Copilot can make mistakes. Confirm policy answers against source documents.
      </p>
    </div>
  )
}
