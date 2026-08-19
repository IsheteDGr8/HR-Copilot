export type WorkSource =
  | "onboarding"
  | "recruiting"
  | "helpdesk"
  | "ticketing"
  | "attendance"
  | "leave"
  | "documents"
  | "adhoc";

export type WorkStatus =
  | "needs_approval"
  | "running"
  | "queued"
  | "blocked"
  | "completed"
  | "failed";

export type StepState = "done" | "active" | "pending" | "approval" | "failed";

export interface RunStep {
  id: string;
  label: string;
  detail?: string;
  state: StepState;
  duration?: string;
  system?: string;
}

export interface ChatMessage {
  id: string;
  role: "agent" | "user";
  time: string;
  body: string;
  approval?: {
    title: string;
    description: string;
    target: string;
  };
}

export interface WorkItem {
  id: string;
  title: string;
  source: WorkSource;
  category: string;
  subject: { name: string; role: string; initials: string };
  status: WorkStatus;
  automation?: string | null;
  priority: "urgent" | "high" | "normal" | "low";
  sla?: string;
  updated?: string;
  updatedAt?: string;
  createdAt?: string;
  externalRef?: string;
  progress: number;
  summary: string;
  steps?: RunStep[];
  messages?: ChatMessage[];
  canvas?: { kind: "documents" | "checklist" | "record"; items: CanvasItem[] };
  linkedChatId?: string | null;
  linkedTicketId?: string | null;
  runId?: string;
}

export interface CanvasItem {
  label: string;
  value: string;
  state?: "ok" | "pending" | "warn";
}

export const sourceMeta: Record<WorkSource, { label: string; system: string }> = {
  onboarding: { label: "Onboarding", system: "HR Copilot" },
  recruiting: { label: "Hiring", system: "Recruiting ATS" },
  helpdesk: { label: "Helpdesk", system: "Helpdesk" },
  ticketing: { label: "Ticket", system: "Helpdesk" },
  attendance: { label: "Attendance", system: "Time & Attendance" },
  leave: { label: "Leave", system: "Leave Management" },
  documents: { label: "Documents", system: "Employee Portal" },
  adhoc: { label: "Ad hoc", system: "Copilot" },
};

export const statusMeta: Record<WorkStatus, { label: string; tone: string }> = {
  needs_approval: { label: "Needs approval", tone: "warning" },
  running: { label: "Agent running", tone: "primary" },
  queued: { label: "Queued", tone: "muted" },
  blocked: { label: "Blocked", tone: "destructive" },
  completed: { label: "Completed", tone: "success" },
  failed: { label: "Failed", tone: "destructive" },
};

export interface Automation {
  id: string;
  name: string;
  trigger: string;
  source: WorkSource;
  steps: number;
  approvals: number;
  runs30d: number;
  successRate: number;
  avgTime: string;
  status: "live" | "draft" | "paused";
  description: string;
}

export const automations: Automation[] = [
  {
    id: "auto-onboarding",
    name: "Employee onboarding",
    trigger: "Offer accepted in Recruiting ATS",
    source: "recruiting",
    steps: 7,
    approvals: 2,
    runs30d: 34,
    successRate: 94,
    avgTime: "6m 20s",
    status: "live",
    description:
      "Collect personal info, retrieve and complete the onboarding packet, send for signature, route NDA to Legal, create IT and payroll tasks.",
  },
  {
    id: "auto-verification-letter",
    name: "Employment verification letter",
    trigger: "Helpdesk ticket · category HR/Documents",
    source: "ticketing",
    steps: 5,
    approvals: 1,
    runs30d: 88,
    successRate: 99,
    avgTime: "48s",
    status: "live",
    description:
      "Read the ticket, pull the employee record, generate the letter and reply on the ticket after disclosure approval.",
  },
  {
    id: "auto-attendance-exceptions",
    name: "Attendance exception reconciliation",
    trigger: "Attendance exception before payroll cutoff",
    source: "attendance",
    steps: 4,
    approvals: 1,
    runs30d: 26,
    successRate: 91,
    avgTime: "3m 05s",
    status: "live",
    description:
      "Reconcile missing punches against badge logs, request manager attestation where ambiguous, push corrections to payroll.",
  },
  {
    id: "auto-leave-case",
    name: "Leave case assembly",
    trigger: "Leave approved in Leave Management",
    source: "leave",
    steps: 4,
    approvals: 1,
    runs30d: 19,
    successRate: 97,
    avgTime: "2m 41s",
    status: "live",
    description:
      "Check policy eligibility, generate the confirmation packet, schedule coverage handoffs and update HR systems.",
  },
  {
    id: "auto-policy-ack",
    name: "Policy acknowledgement rollout",
    trigger: "New policy version published",
    source: "documents",
    steps: 4,
    approvals: 1,
    runs30d: 4,
    successRate: 72,
    avgTime: "31m",
    status: "live",
    description:
      "Distribute policy acknowledgements to a population, chase non-responders and compile a completion report.",
  },
  {
    id: "auto-offboarding",
    name: "Employee offboarding",
    trigger: "Termination ticket · HR queue",
    source: "ticketing",
    steps: 6,
    approvals: 2,
    runs30d: 11,
    successRate: 100,
    avgTime: "4m 12s",
    status: "live",
    description:
      "Revoke access, calculate final pay, schedule asset return, archive exit documents and notify downstream teams.",
  },
  {
    id: "auto-badge-reissue",
    name: "Badge reissue request",
    trigger: "Helpdesk ticket · category Facilities/Badge",
    source: "ticketing",
    steps: 3,
    approvals: 0,
    runs30d: 0,
    successRate: 0,
    avgTime: "—",
    status: "draft",
    description:
      "Drafted from 9 similar ad hoc chats. Verify identity, create the facilities request, notify the employee.",
  },
  {
    id: "auto-tuition-reimbursement",
    name: "Tuition reimbursement review",
    trigger: "Helpdesk ticket · category HR/Benefits",
    source: "ticketing",
    steps: 5,
    approvals: 1,
    runs30d: 6,
    successRate: 83,
    avgTime: "5m 58s",
    status: "paused",
    description:
      "Paused while Finance finalises the FY27 policy caps. Validate eligibility, check spend, route to Finance for payment.",
  },
];

export interface ConnectedSystem {
  name: string;
  kind: string;
  status: "live" | "degraded";
  inbound: string;
  lastSync: string;
}

export const connectedSystems: ConnectedSystem[] = [
  { name: "Helpdesk / Ticketing", kind: "Requests", status: "live", inbound: "42 open HR tickets", lastSync: "12s ago" },
  { name: "Recruiting ATS", kind: "Hiring events", status: "live", inbound: "5 accepted offers", lastSync: "38s ago" },
  { name: "Time & Attendance", kind: "Exceptions", status: "live", inbound: "6 exceptions", lastSync: "1m ago" },
  { name: "Leave Management", kind: "Leave events", status: "live", inbound: "3 approved leaves", lastSync: "2m ago" },
  { name: "Employee Portal", kind: "Documents & signing", status: "degraded", inbound: "38 failed sends", lastSync: "4m ago" },
  { name: "Payroll", kind: "Downstream actions", status: "live", inbound: "corrections queue", lastSync: "5m ago" },
];

export interface ActivityEvent {
  id: string;
  time: string;
  workId: string;
  text: string;
  tone: "primary" | "warning" | "success" | "destructive" | "muted";
}

export const activityFeed: ActivityEvent[] = [
  { id: "a1", time: "10:02", workId: "WRK-2038", text: "Drafting verification letter for Sarah Chen", tone: "primary" },
  { id: "a2", time: "9:44", workId: "WRK-2041", text: "Waiting on approval to send Joe's onboarding packet", tone: "warning" },
  { id: "a3", time: "9:30", workId: "WRK-2036", text: "Attestation request drafted for R. Okafor's shift", tone: "warning" },
  { id: "a4", time: "9:28", workId: "WRK-2036", text: "Reconciled 5 of 6 missing punches from badge logs", tone: "success" },
  { id: "a5", time: "7:13", workId: "WRK-2029", text: "38 acknowledgement sends rejected by Employee Portal", tone: "destructive" },
  { id: "a6", time: "Yesterday", workId: "WRK-2024", text: "Offboarding for Mia Fernandes completed", tone: "success" },
  { id: "a7", time: "Yesterday", workId: "WRK-2019", text: "Ad hoc PTO carryover question answered from policy library", tone: "muted" },
];

export function getAutomation(id: string) {
  return automations.find((a) => a.id === id);
}

export const inboxCounts = {
  needsApproval: 0,
  running: 0,
  queued: 0,
  blocked: 0,
  completedToday: 0,
  hoursSaved: "0h",
  autoResolved: "0%",
};
