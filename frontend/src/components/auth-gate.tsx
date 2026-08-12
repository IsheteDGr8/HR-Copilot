"use client"

import { useEffect, useState, type ReactNode } from "react"
import { Login } from "@/components/pages/Login"

const TOKEN_KEY = "auth_token"

export function AuthGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    try {
      const url = new URL(window.location.href)
      const urlToken = url.searchParams.get("token")

      if (urlToken) {
        localStorage.setItem(TOKEN_KEY, urlToken)
        url.searchParams.delete("token")
        const cleanUrl = url.pathname + (url.search ? url.search : "") + url.hash
        window.history.replaceState({}, "", cleanUrl)
      }

      setToken(localStorage.getItem(TOKEN_KEY))
    } finally {
      setReady(true)
    }
  }, [])

  if (!ready) return null

  if (!token) return <Login />

  return <>{children}</>
}
