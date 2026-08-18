"use client"

import { useCallback, useContext, useMemo, useState, createContext, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"

export type View = "chat" | "skills" | "memory" | "settings" | "tools" | "mcp" | "marketplace"

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
  const router = useRouter()
  const pathname = usePathname()

  const handleSetView = useCallback(
    (v: View) => {
      setView(v)
      if (typeof window === "undefined") return
      // Tools lives on its own route so Gmail/MSAL OAuth can return to /tools.
      // Chat (and the other in-app views) live on /chat.
      if (v === "tools" && !pathname?.startsWith("/tools")) {
        router.push("/tools")
        return
      }
      if (v !== "tools" && pathname?.startsWith("/tools")) {
        router.push("/chat")
      }
    },
    [pathname, router],
  )

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
