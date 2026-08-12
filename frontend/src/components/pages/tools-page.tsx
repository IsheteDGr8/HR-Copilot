"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Wrench,
  Mail,
  MessageSquare,
  LayoutGrid,
  GitBranch,
  Loader2,
  CheckCircle,
  XCircle,
  ExternalLink,
} from "lucide-react"
import { toast } from "sonner"

type IntegrationStatus = {
  gmail: boolean
  slack: boolean
  jira: boolean
  github: boolean
}

const AUTH_TOKEN_KEY = "auth_token"

function authHeaders(): HeadersInit {
  const token =
    (typeof window !== "undefined" && localStorage.getItem(AUTH_TOKEN_KEY)) || "mock-jwt-token"
  return { Authorization: `Bearer ${token}` }
}

type IntegrationCardModel = {
  id: keyof IntegrationStatus
  name: string
  description: string
  icon: typeof Mail
  comingSoon?: boolean
  accent: string
}

const INTEGRATIONS: IntegrationCardModel[] = [
  {
    id: "gmail",
    name: "Google / Gmail",
    description:
      "Send and read mail on behalf of your connected Google account for offers, follow-ups, and HR notices.",
    icon: Mail,
    accent: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  },
  {
    id: "slack",
    name: "Slack",
    description: "Post approvals and onboarding updates into workspace channels.",
    icon: MessageSquare,
    comingSoon: true,
    accent: "border-white/10 bg-white/[0.04] text-neutral-300",
  },
  {
    id: "jira",
    name: "Jira",
    description: "Create IT provisioning tickets and track onboarding work items.",
    icon: LayoutGrid,
    comingSoon: true,
    accent: "border-white/10 bg-white/[0.04] text-neutral-300",
  },
  {
    id: "github",
    name: "GitHub",
    description: "Open PRs for policy docs and sync engineering onboarding checklists.",
    icon: GitBranch,
    comingSoon: true,
    accent: "border-white/10 bg-white/[0.04] text-neutral-300",
  },
]

export function ToolsPage() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/integrations/status", {
        headers: authHeaders(),
        cache: "no-store",
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.detail || data?.error || `Status failed (${res.status})`)
      }
      const data = (await res.json()) as IntegrationStatus
      setStatus({
        gmail: Boolean(data.gmail),
        slack: Boolean(data.slack),
        jira: Boolean(data.jira),
        github: Boolean(data.github),
      })
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : "Unable to load integration status")
      setStatus({ gmail: false, slack: false, jira: false, github: false })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const oauthStatus = params.get("status")
    if (!oauthStatus) return

    if (oauthStatus === "success") {
      toast.success("Google account connected")
      void refreshStatus()
    } else if (oauthStatus === "error") {
      toast.error("Google connection failed. Try again from Tools.")
    }

    params.delete("status")
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`
    window.history.replaceState({}, "", next)
  }, [refreshStatus])

  const connectGmail = () => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY)
    if (!token) {
      toast.error("Please sign in again before connecting Gmail.")
      return
    }
    // Pass JWT in the query string — browser redirects cannot send Authorization.
    window.location.href =
      "/api/v1/integrations/google/login?token=" + encodeURIComponent(token)
  }

  const disconnectGmail = async () => {
    setBusy(true)
    try {
      const res = await fetch("/api/v1/integrations/google/disconnect", {
        method: "POST",
        headers: authHeaders(),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.detail || data?.error || "Disconnect failed")
      }
      toast.success("Gmail disconnected")
      await refreshStatus()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to disconnect Gmail")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-1 flex-col overflow-y-auto px-6 py-8 md:px-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Tools & Integrations
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Connect workplace services your HR agent can use. Start with Gmail to send offers and
            follow-ups from chat.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Wrench className="h-4 w-4" />
          Integrations hub
        </div>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 px-1 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading connection status…
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {INTEGRATIONS.map((item) => {
            const Icon = item.icon
            const connected = item.id === "gmail" ? Boolean(status?.gmail) : false
            return (
              <section
                key={item.id}
                className="rounded-xl border border-white/10 bg-white/[0.02] p-5 transition-colors hover:bg-white/[0.04]"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${item.accent}`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-foreground">{item.name}</h2>
                      {item.comingSoon ? (
                        <span className="inline-flex items-center rounded-md bg-white/5 px-2 py-0.5 text-xs text-muted-foreground">
                          Coming soon
                        </span>
                      ) : connected ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">
                          <CheckCircle className="h-3 w-3" />
                          Connected
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-0.5 text-xs text-muted-foreground">
                          <XCircle className="h-3 w-3" />
                          Not Connected
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex items-center gap-2">
                  {item.id === "gmail" ? (
                    connected ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void disconnectGmail()}
                        className="inline-flex h-8 items-center rounded-md border border-white/15 bg-transparent px-3 text-sm text-foreground transition hover:bg-white/5 disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                        Disconnect
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={connectGmail}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-white px-3 text-sm font-medium text-black transition hover:bg-neutral-200"
                      >
                        Connect Google
                        <ExternalLink className="h-3.5 w-3.5 opacity-70" />
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="inline-flex h-8 cursor-not-allowed items-center rounded-md bg-white/5 px-3 text-sm text-muted-foreground opacity-60"
                    >
                      Coming soon
                    </button>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
