"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, Circle, Loader2, UserRound, X } from "lucide-react"
import { toast } from "sonner"
import { useChat } from "@/lib/chat-store"

export type OnboardingTaskStatus = "Pending" | "In Progress" | "Complete" | string

export type OnboardingTask = {
  id: string
  name: string
  status: OnboardingTaskStatus
  owner: string
}

export type OnboardingWorkflowData = {
  employee_name?: string
  department?: string
  role?: string
  start_date?: string
  checklist?: Array<Record<string, unknown>>
}

type Props = {
  data?: OnboardingWorkflowData | null
}

function normalizeStatus(raw: unknown): OnboardingTaskStatus {
  const s = String(raw || "Pending").trim().toLowerCase()
  if (s === "complete" || s === "completed" || s === "done") return "Complete"
  if (s === "in progress" || s === "in_progress" || s === "progress") return "In Progress"
  return "Pending"
}

function normalizeChecklist(raw: unknown): OnboardingTask[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item, index) => {
    const row = (item || {}) as Record<string, unknown>
    const id = String(row.id || row.key || `task-${index + 1}`)
    const name = String(row.name || row.label || row.key || `Task ${index + 1}`)
    const owner = String(row.owner || row.assignee || "HR / IT")
    return {
      id,
      name,
      owner,
      status: normalizeStatus(row.status),
    }
  })
}

function statusClasses(status: OnboardingTaskStatus): string {
  const s = normalizeStatus(status)
  if (s === "Complete") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
  }
  if (s === "In Progress") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-200"
  }
  return "border-white/10 bg-white/[0.04] text-neutral-400"
}

function cycleStatus(status: OnboardingTaskStatus): OnboardingTaskStatus {
  const s = normalizeStatus(status)
  if (s === "Pending") return "In Progress"
  if (s === "In Progress") return "Complete"
  return "Pending"
}

export function OnboardingWorkflow({ data }: Props) {
  const sendMessage = useChat((s) => s.sendMessage)
  const isRunning = useChat((s) => s.isRunning)

  const employeeName = String(data?.employee_name || "New hire").trim() || "New hire"
  const role = String(data?.role || "").trim()
  const department = String(data?.department || "").trim()
  const startDate = String(data?.start_date || "").trim()

  const [tasks, setTasks] = useState<OnboardingTask[]>(() => normalizeChecklist(data?.checklist))
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    setTasks(normalizeChecklist(data?.checklist))
    setSubmitted(false)
  }, [data])

  const completedCount = useMemo(
    () => tasks.filter((t) => normalizeStatus(t.status) === "Complete").length,
    [tasks],
  )
  const totalCount = tasks.length

  const toggleTask = (id: string) => {
    if (submitted || isRunning) return
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id ? { ...task, status: cycleStatus(task.status) } : task,
      ),
    )
  }

  const confirmProvision = async () => {
    const message =
      `[PROVISIONING APPROVED] Please execute the IT provisioning and notifications for ${employeeName}.`
    setSubmitted(true)
    try {
      await sendMessage(message)
      toast.success("Provisioning approval sent")
    } catch (err) {
      setSubmitted(false)
      toast.error(err instanceof Error ? err.message : "Failed to submit approval")
    }
  }

  const cancel = () => {
    setTasks(normalizeChecklist(data?.checklist))
    setSubmitted(false)
    toast.message("Onboarding draft reset")
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-neutral-200">
            <UserRound className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-semibold text-neutral-50">{employeeName}</h2>
            <p className="mt-0.5 truncate text-[12.5px] text-neutral-400">
              {[role, department].filter(Boolean).join(" · ") || "Role / department pending"}
            </p>
            {startDate ? (
              <p className="mt-1 text-[11px] text-neutral-500">Start date: {startDate}</p>
            ) : null}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 text-[12px]">
          <span className="text-neutral-400">Provisioning checklist</span>
          <span className="font-medium text-neutral-100">
            {completedCount}/{totalCount || 0} Tasks Completed
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-emerald-400/80 transition-all duration-300"
            style={{
              width: totalCount ? `${Math.round((completedCount / totalCount) * 100)}%` : "0%",
            }}
          />
        </div>
      </header>

      <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
        {tasks.length === 0 ? (
          <p className="px-1 py-6 text-center text-[12.5px] text-neutral-500">
            No onboarding tasks available yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tasks.map((task) => {
              const status = normalizeStatus(task.status)
              const done = status === "Complete"
              return (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => toggleTask(task.id)}
                    disabled={submitted || isRunning}
                    className="flex w-full items-start gap-3 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2.5 text-left transition hover:bg-white/[0.03] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {done ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                    ) : (
                      <Circle className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[13px] font-medium text-neutral-100">
                          {task.name}
                        </span>
                        <span
                          className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusClasses(status)}`}
                        >
                          {status}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11.5px] text-neutral-500">Owner: {task.owner}</p>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <footer className="flex flex-col gap-2">
        {submitted ? (
          <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2.5 text-[12.5px] text-neutral-100">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Provisioning approved. Waiting for the agent to continue.
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void confirmProvision()}
              disabled={isRunning}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white px-3 text-[13px] font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-50"
            >
              {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Confirm &amp; Provision IT
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={isRunning}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-transparent px-3 text-[13px] font-medium text-neutral-300 transition hover:bg-white/[0.04] disabled:opacity-50"
            >
              <X className="h-4 w-4" />
              Cancel
            </button>
          </>
        )}
      </footer>
    </div>
  )
}

export default OnboardingWorkflow
