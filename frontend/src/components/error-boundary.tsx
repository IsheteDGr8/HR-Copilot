"use client"

import { Component, type ReactNode } from "react"
import { AlertTriangle, RotateCcw } from "lucide-react"

type Props = {
  children: ReactNode
  /** Short label for what failed, e.g. "chat" or "Side Canvas". */
  label?: string
  /** Optional custom fallback; receives a reset callback. */
  fallback?: (reset: () => void, error: Error | null) => ReactNode
}

type State = {
  hasError: boolean
  error: Error | null
}

/**
 * Client-side error boundary so a render/SSE-driven crash in one pane (chat or
 * canvas) is contained instead of blanking the whole console. Offers a reset so
 * the user can retry without a full reload.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error(`[ErrorBoundary${this.props.label ? `:${this.props.label}` : ""}]`, error, info)
  }

  reset = () => this.setState({ hasError: false, error: null })

  render() {
    if (!this.state.hasError) return this.props.children
    if (this.props.fallback) return this.props.fallback(this.reset, this.state.error)

    const what = this.props.label || "view"
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <AlertTriangle className="h-8 w-8 text-amber-400/80" />
        <p className="text-[13px] font-medium text-neutral-200">Something broke in the {what}.</p>
        <p className="max-w-sm text-[12px] leading-relaxed text-neutral-500">
          {this.state.error?.message || "An unexpected error occurred while rendering this panel."}
        </p>
        <button
          type="button"
          onClick={this.reset}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[12.5px] font-medium text-neutral-100 transition-colors hover:bg-white/[0.1]"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Retry
        </button>
      </div>
    )
  }
}

export default ErrorBoundary
