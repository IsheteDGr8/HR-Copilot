"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, KeyRound, Loader2, Server, ShieldCheck, Zap } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tag } from "@/components/management/shared"
import * as mcpApi from "@/lib/mcp-api"
import { substitutePlaceholders, useMcp, type McpSetupValues } from "@/lib/mcp-store"
import { McpSetupForm } from "./mcp-setup-form"
import type { LibraryServer, McpConnection } from "./mcp-types"

/** Convert an integration's .mcp.json server template (after ${VAR}
 *  substitution) into a POST /api/mcp/test spec. Uses the same normalization
 *  the store applies to connections: streamable-http -> http. */
function templateToProbeSpec(
  template: Record<string, unknown>,
  values: Record<string, string | boolean>,
): mcpApi.McpTestServerSpec | null {
  const t = JSON.parse(JSON.stringify(template)) as Record<string, unknown>
  substitutePlaceholders(t, values)
  if (t.transport === "stdio" || (typeof t.command === "string" && t.command)) {
    if (typeof t.command !== "string" || !t.command) return null
    return {
      type: "stdio",
      command: t.command,
      args: Array.isArray(t.args) ? (t.args as string[]) : [],
      ...(t.env && typeof t.env === "object" ? { env: t.env as Record<string, string> } : {}),
    }
  }
  if (typeof t.url !== "string" || !t.url) return null
  const remote: Record<string, unknown> = { type: "http", url: t.url }
  if (t.headers && typeof t.headers === "object" && Object.keys(t.headers as object).length > 0) {
    remote.headers = t.headers
  }
  // Preserve auth (especially strategy: "oauth2" + authentication metadata)
  // so the backend OAuth probe recognizes this as an OAuth server.
  if (t.auth && typeof t.auth === "object") {
    remote.auth = t.auth
  }
  return remote as mcpApi.McpTestServerSpec
}

/* ------------------------------------------------------------------ */
/*  Setup / configure a marketplace MCP                                */
/*  Schema-driven credentials (token / OAuth / env) against the         */
/*  integration's .mcp.json template. Persists global secrets + OAuth   */
/*  sessions through the same backend the runtime uses, then re-loads   */
/*  connections so setup status is recomputed from truth.               */
/* ------------------------------------------------------------------ */

export function McpSetupDialog({
  server,
  connection,
  onOpenChange,
  onEdit,
}: {
  /** The installed integration (setup schema + .mcp.json templates). */
  server: LibraryServer | null
  /** The provisioned server on the MCP page. */
  connection: McpConnection | null
  onOpenChange: (open: boolean) => void
  /** Opens the existing full-config edit popup for this server. */
  onEdit?: (conn: McpConnection) => void
}) {
  const { saveSecret, patchServerConfig, startOAuth, completeOAuth, load } = useMcp()
  const isOpen = server !== null && connection !== null

  const [setup, setSetup] = useState<McpSetupValues>({ values: {} })
  const [saving, setSaving] = useState(false)
  const [testState, setTestState] = useState<{ state: "idle" | "testing" | "ok" | "fail"; detail?: string }>({
    state: "idle",
  })

  // Reset per-target state when the user switches integration/server without
  // closing the dialog in between.
  useEffect(() => {
    setSetup({ values: {} })
    setTestState({ state: "idle" })
  }, [server?.id, connection?.id])

  if (!server || !connection) return null

  const schema = server.setup
  const templates = server.servers ?? {}
  const serverNames = Object.keys(templates)
  const firstTemplate = serverNames.length > 0 ? (templates[serverNames[0]] as Record<string, unknown> | undefined) : undefined

  // Whether this server already holds a completed OAuth session (re-setup).
  const savedAuth = connection.config?.auth as Record<string, unknown> | undefined
  const oauthAlready = savedAuth?.strategy === "oauth2" && Boolean(savedAuth.state)
  const isOAuth = schema?.auth?.method === "oauth2"

  const handleConnectOAuth = async (clientId?: string, clientSecret?: string) => {
    if (!firstTemplate) return null
    const spec = templateToProbeSpec(firstTemplate, setup.values)
    if (!spec) return null
    return startOAuth(spec, { clientId, clientSecret })
  }

  /* Persist the completed session into this server's config the moment the
     browser flow settles — the session is usable even if the user closes the
     dialog without hitting Save. */
  const handleCompleteOAuth = async (jobId: string, onSuccess?: (state: Record<string, unknown>) => void) => {
    return completeOAuth(jobId, (state) => {
      void patchServerConfig(connection.id, { auth: { strategy: "oauth2", state } })
      onSuccess?.(state)
    })
  }

  const handleTestResult = (ok: boolean, detail: string) =>
    setTestState(ok ? { state: "ok", detail } : { state: "fail", detail })

  const handleTest = async () => {
    if (!firstTemplate) return { ok: false, detail: "This integration has no MCP server template to probe" }
    const spec = templateToProbeSpec(firstTemplate, setup.values)
    if (!spec) return { ok: false, detail: "Complete the setup fields, then test" }
    
    const testTool = (schema as any)?.test_tool as { name: string; arguments?: Record<string, unknown> } | undefined
    const result = await mcpApi.testServer({ server: spec, timeout: 15, tool_call: testTool })
    if (!result.ok) {
      return { ok: false, detail: result.error }
    }
    if (result.tool_result?.is_error) {
      return { ok: false, detail: result.tool_result.text }
    }
    return { ok: true, detail: `Connection successful. ${result.tools.length} tools discovered` }
  }

  const handleSave = async () => {
    if (!schema) return
    // Validate required fields from the schema.
    for (const field of schema.fields ?? []) {
      if (field.required && !String(setup.values[field.name] ?? "").trim()) {
        toast.error(`${field.label} is required`)
        return
      }
    }
    if (schema.auth?.method === "token" && schema.auth.token_field) {
      if (!String(setup.values[schema.auth.token_field] ?? "").trim()) {
        toast.error(`Enter the ${schema.auth.label ?? "access token"} first`)
        return
      }
    }
    if (schema.auth?.method === "oauth2" && !setup.oauthState && !oauthAlready && !savedAuth) {
      toast.error("Complete the OAuth flow first")
      return
    }

    setSaving(true)
    try {
      let persisted = false

      // 1) Persist every collected value as a global secret so ${VAR}
      //    placeholders in the template resolve at conversation build time.
      for (const [name, value] of Object.entries(setup.values)) {
        if (typeof value === "string" && value.trim()) {
          try {
            await saveSecret(name, value.trim())
            persisted = true
          } catch (error) {
            console.warn(`Failed to store secret ${name}:`, error)
          }
        }
      }

      // 2) OAuth: keep the completed session (if not already persisted by the
      //    completion callback) and store the client id/secret so re-auth can
      //    reuse them.
      if (isOAuth && schema?.auth) {
        const envPatch: Record<string, string | null> = {}
        const { client_id, client_secret } = schema.auth as Record<string, string>
        for (const clientField of [client_id, client_secret]) {
          if (clientField && typeof setup.values[clientField] === "string") {
            envPatch[clientField] = setup.values[clientField] as string
          }
        }
        if (Object.keys(envPatch).length > 0) {
          await patchServerConfig(connection.id, { env: envPatch })
          persisted = true
        }
        if (setup.oauthState) {
          await patchServerConfig(connection.id, { auth: { strategy: "oauth2", state: setup.oauthState } })
          persisted = true
        }
      }

      if (!persisted && connection.setupNeeded) {
        toast.error("Nothing to save — enter the credentials this server needs first")
        return
      }

      await load()
      toast.success(`${connection.name} configured`, {
        description: "Credentials saved — the server is ready to use",
      })
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to configure ${connection.name}`)
    } finally {
      setSaving(false)
    }
  }

  const Icon = server.icon

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] gap-0 overflow-y-auto border-border/60 bg-card p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border/60 px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-secondary/60">
              <Icon className="h-5 w-5 text-foreground" />
            </span>
            <div>
              <DialogTitle className="font-heading text-lg">Set up {connection.name}</DialogTitle>
              <DialogDescription className="text-muted-foreground">{server.description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-5 px-6 py-6">
          {/* Endpoint summary — read-only here; full editing stays in Edit. */}
          {firstTemplate && (
            <div className="rounded-lg border border-border/60 bg-secondary/30 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Server endpoint
              </p>
              <p className="mt-1 font-mono text-[13px] text-foreground">
                {firstTemplate.transport === "stdio" || firstTemplate.command
                  ? `stdio · ${String(firstTemplate.command ?? "")}`
                  : `remote · ${String(firstTemplate.url ?? "")}`}
              </p>
            </div>
          )}

          {/* What is still missing — drives the "Setup needed" state. */}
          {connection.missingSecrets.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-4 py-3">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-amber-300">Credentials required</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {connection.missingSecrets.map((name) => (
                    <Tag key={name} className="border-amber-500/30 bg-amber-500/10 text-amber-300/90">
                      {name}
                    </Tag>
                  ))}
                </div>
              </div>
            </div>
          )}

          {schema ? (
            <McpSetupForm
              key={`${server.id}-${connection.id}`}
              schema={schema}
              oauthConnected={oauthAlready}
              disabled={saving}
              onConnectOAuth={handleConnectOAuth}
              onCompleteOAuth={handleCompleteOAuth}
              onValues={setSetup}
            />
          ) : (
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              This integration has no dynamic setup schema. Configure credentials from the configuration tab, or open
              Edit for the full server settings.
            </p>
          )}

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-secondary/30 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-foreground">Validate connection</p>
              <p className="truncate text-xs text-muted-foreground">
                {testState.state === "ok" && (
                  <span className="flex items-center gap-1 text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    {testState.detail}
                  </span>
                )}
                {testState.state === "fail" && <span className="text-red-400">{testState.detail}</span>}
                {testState.state === "idle" && "Probes the server with the current credentials"}
                {testState.state === "testing" && "Connecting…"}
              </p>
            </div>
            {testState.state === "testing" ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  handleTest().then((r) => {
                    handleTestResult(r.ok, r.detail)
                  })
                }
                disabled={saving}
                className="gap-2 border border-border/60 bg-secondary/60 hover:bg-secondary"
              >
                <Zap className="h-4 w-4" />
                Test
              </Button>
            )}
          </div>
        </div>

        <DialogFooter className="border-t border-border/60 px-6 py-4">
          <div className="flex w-full items-center justify-between gap-2">
            <Button
              variant="ghost"
              onClick={() => onEdit?.(connection)}
              disabled={saving}
              className="gap-2 text-muted-foreground"
            >
              <Server className="h-4 w-4" />
              Edit full configuration
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="gap-2 bg-primary text-primary-foreground hover:opacity-90"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {saving ? "Saving…" : "Save & configure"}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
