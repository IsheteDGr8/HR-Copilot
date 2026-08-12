"use client"

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"

export type View = "chat" | "skills" | "memory" | "settings" | "tools"

interface NavigationContextValue {
  view: View
  setView: (view: View) => void
}

const NavigationContext = createContext<NavigationContextValue | null>(null)

export function NavigationProvider({
  children,
  initialView = "chat",
}: {
  children: ReactNode
  initialView?: View
}) {
  const [view, setView] = useState<View>(initialView)

  const handleSetView = useCallback((v: View) => {
    setView(v)
    if (typeof window === "undefined") return
    // Keep a shallow URL for Tools so OAuth can return to /tools.
    if (v === "tools" && !window.location.pathname.startsWith("/tools")) {
      window.history.pushState({}, "", "/tools")
    } else if (v !== "tools" && window.location.pathname.startsWith("/tools")) {
      window.history.pushState({}, "", "/")
    }
  }, [])

  const value = useMemo(
    () => ({
      view,
      setView: handleSetView,
    }),
    [view, handleSetView],
  )
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>
}

export function useNavigation() {
  const ctx = useContext(NavigationContext)
  if (!ctx) throw new Error("useNavigation must be used within a NavigationProvider")
  return ctx
}
