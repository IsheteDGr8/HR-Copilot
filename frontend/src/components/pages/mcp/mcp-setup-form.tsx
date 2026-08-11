"use client"

import { useState } from "react"
import { CheckCircle2, ExternalLink, Eye, EyeOff, Loader2, ShieldCheck, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { McpSetupSchema, SetupField } from "./mcp-types"
import type { McpSetupValues } from "@/lib/mcp-store"

/* ------------------------------------------------------------------ */
/*  Shared field shell                                                 */
/* ------------------------------------------------------------------ */

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-[13px] font-medium text-foreground">
        {label}
        {required && <span className="ml-1 text-red-400">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function SecretInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/60 bg-secondary/40 px-3 focus-within:border-border">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full bg-transparent font-mono text-[13px] text-foreground outline-none placeholder:text-muted-foreground/70"
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        aria-label={show ? "Hide value" : "Show value"}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

function HintBanner({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-secondary/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
      <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{text}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Schema field renderer (text / password / textarea / select / bool) */
/* ------------------------------------------------------------------ */

export function SetupFields({
  fields,
  values,
  onChange,
  disabled,
}: {
  fields: SetupField[]
  values: Record<string, string | boolean>
  onChange: (next: Record<string, string | boolean>) => void
  disabled?: boolean
}) {
  if (!fields || fields.length === 0) return null

  const set = (name: string, value: string | boolean) => onChange({ ...values, [name]: value })

  return (
    <div className="flex flex-col gap-4">
      {fields.map((field) => {
        const raw = values[field.name]
        const current = typeof raw === "boolean" ? (raw ? "true" : "false") : (raw as string | undefined) ?? ""
        return (
          <Field key={field.name} label={field.label} hint={field.hint} required={field.required}>
            {field.type === "boolean" ? (
              <Switch
                checked={Boolean(raw)}
                onCheckedChange={(b) => set(field.name, b)}
                disabled={disabled}
                aria-label={field.label}
              />
            ) : field.type === "select" ? (
              <Select
                value={current}
                onValueChange={(val) => set(field.name, val)}
                disabled={disabled}
              >
                <SelectTrigger className="bg-secondary/40">
                  <SelectValue placeholder={field.placeholder ?? "Select…"} />
                </SelectTrigger>
                <SelectContent>
                  {field.options?.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : field.type === "textarea" ? (
              <Textarea
                value={current}
                onChange={(e) => set(field.name, e.target.value)}
                placeholder={field.placeholder}
                disabled={disabled}
                className="min-h-[64px] resize-none bg-secondary/40 font-mono text-[13px]"
              />
            ) : field.type === "password" || field.secret ? (
              <SecretInput
                value={current}
                onChange={(v) => set(field.name, v)}
                placeholder={field.placeholder}
              />
            ) : (
              <Input
                value={current}
                onChange={(e) => set(field.name, e.target.value)}
                placeholder={field.placeholder}
                disabled={disabled}
                className="bg-secondary/40 font-mono text-[13px]"
              />
            )}
          </Field>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Full per-integration setup form                                    */
/*  Renders the auth method (token / OAuth / env) plus the schema      */
/*  fields, and reports collected values upward for provisioning.      */
/* ------------------------------------------------------------------ */

export function McpSetupForm({
  schema,
  initial = {},
  oauthConnected = false,
  disabled = false,
  onConnectOAuth,
  onCompleteOAuth,
  onValues,
}: {
  schema: McpSetupSchema
  /** Prefill values (e.g. env already saved on a re-install). */
  initial?: Record<string, string>
  /** True when the server already holds a completed OAuth session. */
  oauthConnected?: boolean
  disabled?: boolean
  /** Start the OAuth flow for this integration; resolves with the job id. */
  onConnectOAuth?: (clientId?: string, clientSecret?: string) => Promise<string | null>
  /** Poll an OAuth job; the success callback receives the persisted session. */
  onCompleteOAuth?: (jobId: string, onSuccess?: (state: Record<string, unknown>) => void) => Promise<"ok" | "failed">
  /** Emitted on every change so the caller can provision with current values. */
  onValues?: (values: McpSetupValues) => void
}) {
  const auth = schema.auth ?? ({} as Record<string, unknown>)
  const isOAuth = (auth as any).method === "oauth2"
  const [values, setValues] = useState<Record<string, string | boolean>>(() => ({ ...initial }))
  const [oauthState, setOauthState] = useState<Record<string, unknown> | null>(null)
  const [oauthBusy, setOauthBusy] = useState(false)
  const [oauthStarted, setOauthStarted] = useState(false)

  const connected = oauthState !== null || oauthConnected

  const emit = (next: Record<string, string | boolean>, state: Record<string, unknown> | null = oauthState) =>
    onValues?.({ values: next, oauthState: state, isOAuth })

  const handleValues = (next: Record<string, string | boolean>) => {
    setValues(next)
    emit(next)
  }

  const handleOAuthState = (state: Record<string, unknown>) => {
    setOauthState(state)
    setOauthBusy(false)
    emit(values, state)
  }

  const clientIdValue = typeof values[(auth as any).client_id ?? ""] === "string" ? (values[(auth as any).client_id ?? ""] as string) : undefined
  const clientSecretValue =
    typeof values[(auth as any).client_secret ?? ""] === "string" ? (values[(auth as any).client_secret ?? ""] as string) : undefined

  const handleConnect = async () => {
    if (!onConnectOAuth || oauthBusy || connected) return
    setOauthBusy(true)
    setOauthStarted(true)
    try {
      const jobId = await onConnectOAuth(clientIdValue, clientSecretValue)
      if (!jobId) {
        setOauthBusy(false)
        return
      }
      // Poll until the browser-coordinated flow settles (success or failure).
      await onCompleteOAuth?.(jobId, handleOAuthState)
      setOauthBusy(false)
    } catch {
      setOauthBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* --- auth method header --- */}
      {auth.hint && auth.method !== "token" && <HintBanner text={auth.hint} />}

      {/* --- token method: one secret field from the schema --- */}
      {auth.method === "token" && auth.token_field && (
        <Field label={auth.label ?? "Access token"} hint={auth.hint} required>
          <SecretInput
            value={(values[auth.token_field] as string | undefined) ?? ""}
            onChange={(v) => handleValues({ ...values, [auth.token_field!]: v })}
            placeholder="••••••••••••••••"
          />
        </Field>
      )}

      {/* --- oauth2 method: connect button + saved session state --- */}
      {isOAuth && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-secondary/30 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-foreground">Authentication</p>
            <p className="truncate text-xs text-muted-foreground">
              {connected ? (
                <span className="flex items-center gap-1 text-emerald-400">
                  <ShieldCheck className="h-3 w-3" />
                  OAuth session saved for this server
                </span>
              ) : oauthBusy ? (
                <span className="flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Waiting for authorization…
                </span>
              ) : oauthStarted ? (
                "Open the provider tab and approve access."
              ) : (
                "Authorize this integration to reach your account."
              )}
            </p>
          </div>
          {connected ? (
            <span className="flex shrink-0 items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              Connected
            </span>
          ) : (
            <Button
              type="button"
              variant="secondary"
              onClick={handleConnect}
              disabled={oauthBusy || disabled}
              className="gap-2 border border-border/60 bg-secondary/60 hover:bg-secondary"
            >
              {oauthBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              {auth.label ?? "Connect"}
            </Button>
          )}
        </div>
      )}

      {/* --- schema fields (OAuth client creds, M365/PG env values, …) --- */}
      <SetupFields
        fields={schema.fields ?? []}
        values={values}
        onChange={handleValues}
        disabled={disabled}
      />
    </div>
  )
}
