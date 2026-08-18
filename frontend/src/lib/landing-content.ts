import { Wallet, UserPlus, LifeBuoy, GraduationCap, Repeat, Building2, Bot, Laptop, type LucideIcon } from "lucide-react"

export interface Scenario {
  icon: LucideIcon
  tint: string
  title: string
  desc: string
  benefits: string[]
}

export const SCENARIOS: Scenario[] = [
  { icon: Wallet, tint: "#1F4E79", title: "Benefits & Compensation",
    desc: "Ask about health coverage, dependents, or pay bands and get an answer sourced straight from the current policy — no ticket required.",
    benefits: ["24/7 instant answers, no waiting on HR", "Always reflects the latest policy version"] },
  { icon: UserPlus, tint: "#FF6B4A", title: "Onboarding & Setup",
    desc: "New hires get a personalized walk-through of week-one tasks, IT setup steps, and who to meet, without hunting through a handbook.",
    benefits: ["Cuts new-hire ramp-up time", "Consistent experience across every team"] },
  { icon: LifeBuoy, tint: "#F5A623", title: "Employee Issue Resolution",
    desc: "Get guided next steps for leave requests, expense questions, or workplace concerns, with a clear handoff to a human when it matters.",
    benefits: ["Lower resolution time on routine requests", "Escalates sensitive issues to real people"] },
  { icon: Laptop, tint: "#2E9E7C", title: "Asset Management",
    desc: "Ask what equipment a new hire needs, request it from IT, and check what's issued, pending, or waiting to be returned — all without leaving the chat.",
    benefits: ["Real-time status on every asset request", "One place for onboarding and offboarding gear"] },
  { icon: GraduationCap, tint: "#1F4E79", title: "Learning & Growth",
    desc: "Surfaces relevant training, certifications, and internal growth paths based on an employee's role and goals.",
    benefits: ["Personalized learning recommendations", "Higher completion of development plans"] },
  { icon: Repeat, tint: "#FF6B4A", title: "Job Transitions",
    desc: "Walks employees through internal transfers, promotions, or role changes — what paperwork's needed and what happens next.",
    benefits: ["Fewer stalled transitions", "Clear, self-serve process at every step"] },
]

export const MANUAL_PAINS: string[] = [
  "Repetitive HR tasks consume valuable time",
  "Finding employee information takes multiple steps",
  "Manual onboarding creates delays and follow-ups",
  "HR processes are scattered across tools and documents",
]

export const AI_WINS: string[] = [
  "Automates repetitive HR requests and workflows",
  "One place for policies, documents, and employee information",
  "Simplifies onboarding and document collection",
  "Centralizes employee data, documents, and HR processes",
]

export interface Partner {
  icon: LucideIcon
  name: string
  role: string
  blurb: string
}

export const PARTNERS: Partner[] = [
  { icon: Building2, name: "Quadrant", role: "Enterprise rollout & scaling partner",
    blurb: "Supports our enterprise customers through security review and scaling the platform for larger organizations." },
  { icon: Bot, name: "Microsoft", role: "Cloud & AI infrastructure partner",
    blurb: "ClosedAI runs on Microsoft Azure — Azure OpenAI for generation and Azure AI Search for retrieval, with Entra ID for secure sign-in." },
]

export interface Office {
  city: string
  lines: string[]
}

export const OFFICES: Office[] = [
  { city: "Redmond", lines: ["5020 148th Ave NE,", "Redmond, WA 98052"] },
]

export const SOLUTIONS_LINKS: string[] = ["HR Policy Q&A", "Recruiting", "Onboarding", "Benefits", "Manager Insights"]
export const RESOURCES_LINKS: string[] = ["Resource Center", "Blog", "Guides", "FAQ", "Partners", "API Documentation"]

export const AVATAR_COLORS: string[] = ["#1F4E79", "#FF6B4A", "#F5A623", "#2E9E7C", "#3D5A80"]

export interface Agent {
  name: string
  role: string
  jacket: string
  collar: string
  hair: string
  skin: string
  style: "short" | "bun" | "swoop" | "cap" | "curly"
  desc: string
}

export const AGENTS: Agent[] = [
  { name: "Leave Agent", role: "Leave & PTO", jacket: "#1F4E79", collar: "#E8EEF4", hair: "#2B2340", skin: "#E8B48C", style: "short", desc: "Tracks balances, accrual, and approval steps for every leave request." },
  { name: "Benefits Agent", role: "Benefits & Compensation", jacket: "#FF6B4A", collar: "#FFE3D9", hair: "#4A2E1E", skin: "#C98858", style: "bun", desc: "Explains coverage, dependents, and enrollment windows in plain language." },
  { name: "Onboarding Agent", role: "Onboarding & Setup", jacket: "#F5A623", collar: "#FFF3DA", hair: "#B85C2E", skin: "#F2C29B", style: "swoop", desc: "Walks new hires through week one, step by step." },
  { name: "Recruiting Agent", role: "Resume Screening & Recruiting", jacket: "#2E9E7C", collar: "#DFF3EC", hair: "#1B1B2A", skin: "#8C5A3C", style: "cap", desc: "Screens resumes against job requirements and helps build the right interview questions." },
  { name: "Growth Agent", role: "Learning & Growth", jacket: "#3D5A80", collar: "#E4EAF2", hair: "#292929", skin: "#E0A878", style: "curly", desc: "Recommends training and career paths based on role and goals." },
]
