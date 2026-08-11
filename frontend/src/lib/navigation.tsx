"use client"

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"

export type View = "chat" | "skills" | "memory" | "settings"

interface NavigationContextValue {
  view: View
  setView: (view: View) => void
}

const NavigationContext = createContext<NavigationContextValue | null>(null)

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>("chat")

  const handleSetView = useCallback((v: View) => {
    setView(v)
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
