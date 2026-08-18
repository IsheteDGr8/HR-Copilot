"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"

export function MarkdownMessage({
  content,
  className,
}: {
  content: string
  className?: string
}) {
  return (
    <div className={cn("chat-md", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || ""}</ReactMarkdown>
    </div>
  )
}
