"use client"

import { useCallback, useEffect, useState } from "react"
import type { IntakeCategory, IntakeItem, IntakeOverview } from "@/lib/intake-data"
import { enrichIntakeItem } from "@/lib/intake-data"

const AUTH_TOKEN_KEY = "auth_token"

function authHeaders(): HeadersInit {
  const token =
    (typeof window !== "undefined" && localStorage.getItem(AUTH_TOKEN_KEY)) || "mock-jwt-token"
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
}

export type IntakeTicketPatch = {
  action?: "route" | "group" | "close"
  route_target?: string
  category?: string
  close_reason?: string
  note?: string
  status?: string
  disposition?: string
  employee_id?: string
}

type IntakeApiResponse = {
  ok: boolean
  tickets: IntakeItem[]
  overview: IntakeOverview
  categories: IntakeCategory[]
}

export async function fetchIntake(params?: {
  status?: string
  disposition?: string
  category?: string
}): Promise<IntakeApiResponse> {
  const qs = new URLSearchParams()
  if (params?.status) qs.set("status", params.status)
  if (params?.disposition) qs.set("disposition", params.disposition)
  if (params?.category) qs.set("category", params.category)
  const suffix = qs.toString() ? `?${qs.toString()}` : ""
  const res = await fetch(`/api/v1/intake/tickets${suffix}`, { headers: authHeaders() })
  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error(err?.detail || `Failed to load intake (${res.status})`)
  }
  const data = (await res.json()) as IntakeApiResponse
  return {
    ...data,
    tickets: (data.tickets || []).map(enrichIntakeItem),
  }
}

export async function patchIntakeTicket(
  ticketId: string,
  body: IntakeTicketPatch,
): Promise<IntakeItem> {
  const res = await fetch(`/api/v1/intake/tickets/${encodeURIComponent(ticketId)}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error(err?.detail || `Update failed (${res.status})`)
  }
  const data = await res.json()
  return enrichIntakeItem(data.ticket)
}

export function useIntake() {
  const [tickets, setTickets] = useState<IntakeItem[]>([])
  const [overview, setOverview] = useState<IntakeOverview | null>(null)
  const [categories, setCategories] = useState<IntakeCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchIntake()
      setTickets(data.tickets)
      setOverview(data.overview)
      setCategories(data.categories)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load intake")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const patchTicket = useCallback(
    async (ticketId: string, body: IntakeTicketPatch) => {
      const updated = await patchIntakeTicket(ticketId, body)
      setTickets((prev) => prev.map((t) => (t.id === ticketId ? updated : t)))
      const data = await fetchIntake()
      setOverview(data.overview)
      setCategories(data.categories)
      return updated
    },
    [],
  )

  return { tickets, overview, categories, loading, error, reload, patchTicket }
}
