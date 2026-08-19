export type IntakeChannel =
  | "helpdesk"
  | "email"
  | "portal"
  | "chat"
  | "system"
  | "form"
  | "phone"

export type IntakeState = "new" | "triaged" | "waiting" | "handled"

export type IntakeDisposition = "auto" | "assist" | "human"

export interface IntakeItem {
  id: string
  subject: string
  requester: { name: string; role: string; initials: string }
  channel: IntakeChannel
  category: string
  topic: string
  urgency: "urgent" | "high" | "normal" | "low"
  age: string
  ageMinutes: number
  due: string
  dueLabel: string
  state: IntakeState
  disposition: IntakeDisposition
  confidence: number
  snippet: string
  suggestion: string
  linkedWorkId?: string | null
  status?: string
  createdAt?: string
  employeeId?: string
}

export interface IntakeCategory {
  id: string
  label: string
  open: number
}

export interface IntakeOverview {
  arrived_today: number
  auto_absorbed: number
  open: number
  needs_judgement: number
  by_disposition?: Record<string, number>
  by_category?: Record<string, number>
  generated_at?: string
}

export const channelMeta: Record<IntakeChannel, string> = {
  helpdesk: "Helpdesk",
  email: "HR inbox",
  portal: "Employee portal",
  chat: "Slack",
  system: "System event",
  form: "Form",
  phone: "Phone note",
}

export const dispositionMeta: Record<
  IntakeDisposition,
  { label: string; tone: string; blurb: string }
> = {
  auto: {
    label: "Copilot can handle",
    tone: "success",
    blurb: "Known playbook — Copilot can run end-to-end.",
  },
  assist: {
    label: "Copilot drafted",
    tone: "primary",
    blurb: "Draft ready — review before send or execute.",
  },
  human: {
    label: "Needs your judgement",
    tone: "warning",
    blurb: "Ambiguous or sensitive — you decide next step.",
  },
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function formatRelativeAge(iso?: string): { age: string; ageMinutes: number } {
  if (!iso) return { age: "—", ageMinutes: 0 }
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return { age: "—", ageMinutes: 0 }
  const diff = Math.max(0, Date.now() - then)
  const ageMinutes = Math.floor(diff / MINUTE)
  if (diff < HOUR) return { age: `${Math.max(1, ageMinutes)}m`, ageMinutes }
  if (diff < DAY) return { age: `${Math.floor(diff / HOUR)}h`, ageMinutes }
  return { age: `${Math.floor(diff / DAY)}d`, ageMinutes }
}

export function formatDueLabel(iso?: string): string {
  if (!iso) return "—"
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return iso
  const diff = then - Date.now()
  if (diff < 0) return "Overdue"
  if (diff < HOUR) return `${Math.ceil(diff / MINUTE)}m`
  if (diff < DAY) return `${Math.ceil(diff / HOUR)}h`
  return `${Math.ceil(diff / DAY)}d`
}

export function enrichIntakeItem(raw: Partial<IntakeItem> & { id: string }): IntakeItem {
  const { age, ageMinutes } = formatRelativeAge(raw.createdAt)
  const dueLabel = formatDueLabel(raw.due)
  const name = raw.requester?.name || "Unknown"
  const initials =
    raw.requester?.initials ||
    name
      .split(" ")
      .filter(Boolean)
      .map((p) => p[0]?.toUpperCase())
      .join("")
      .slice(0, 2) ||
    "??"
  return {
    id: raw.id,
    subject: raw.subject || "",
    requester: {
      name,
      role: raw.requester?.role || "",
      initials: name === "Withheld" ? "··" : initials,
    },
    channel: (raw.channel as IntakeChannel) || "helpdesk",
    category: raw.category || raw.topic || "General",
    topic: raw.topic || raw.category || "General",
    urgency: raw.urgency || "normal",
    age,
    ageMinutes,
    due: raw.due || "",
    dueLabel,
    state: raw.state || "new",
    disposition: raw.disposition || "assist",
    confidence: Number(raw.confidence ?? 0),
    snippet: raw.snippet || "",
    suggestion: raw.suggestion || "",
    linkedWorkId: raw.linkedWorkId ?? null,
    status: raw.status,
    createdAt: raw.createdAt,
    employeeId: raw.employeeId,
  }
}

export function itemsForCategory(tickets: IntakeItem[], categoryLabel: string) {
  return tickets.filter((i) => i.category === categoryLabel)
}

export function openTickets(tickets: IntakeItem[]) {
  return tickets.filter((i) => i.state !== "handled")
}

export function deriveStats(overview: IntakeOverview | null, tickets: IntakeItem[]) {
  const open = overview?.open ?? openTickets(tickets).length
  return {
    arrivedToday: overview?.arrived_today ?? 0,
    autoAbsorbed: overview?.auto_absorbed ?? 0,
    open,
    needsJudgement: overview?.needs_judgement ?? 0,
  }
}

export function categoryId(label: string) {
  return label.toLowerCase().replace(/\s+/g, "-").replace(/&/g, "and")
}

export function categoryLabelFromId(categories: IntakeCategory[], id: string) {
  return categories.find((c) => c.id === id)?.label ?? id.replace(/-/g, " ")
}

export function isRestrictedCategory(label: string) {
  return label.toLowerCase().includes("employee relations")
}
