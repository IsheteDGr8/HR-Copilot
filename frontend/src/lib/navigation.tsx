"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"

export type View = "chat" | "mcp" | "skills" | "marketplace" | "memory" | "settings"
export type MarketplaceSection = "home" | "skills" | "mcp"

interface NavigationContextValue {
  view: View
  setView: (view: View) => void
  marketplaceSection: MarketplaceSection
  setMarketplaceSection: (s: MarketplaceSection) => void
  marketplaceOrigin: View
}

const NavigationContext = createContext<NavigationContextValue | null>(null)

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>("chat")
  const [marketplaceSection, setMarketplaceSection] = useState<MarketplaceSection>("home")
  const [marketplaceOrigin, setMarketplaceOrigin] = useState<View>("skills")
  const prevViewRef = useRef<View>(view)

  // Remember where the user came from, and reset the marketplace section when leaving
  useEffect(() => {
    if (view === "marketplace" && prevViewRef.current !== "marketplace") {
      setMarketplaceOrigin(prevViewRef.current)
    }
    if (prevViewRef.current === "marketplace" && view !== "marketplace") {
      setMarketplaceSection("home")
    }
    prevViewRef.current = view
  }, [view])

  const handleSetView = useCallback((v: View) => {
    setView(v)
  }, [])

  const handleSetMarketplaceSection = useCallback((s: MarketplaceSection) => {
    setMarketplaceSection(s)
  }, [])

  const value = useMemo(
    () => ({
      view,
      setView: handleSetView,
      marketplaceSection,
      setMarketplaceSection: handleSetMarketplaceSection,
      marketplaceOrigin,
    }),
    [view, handleSetView, marketplaceSection, handleSetMarketplaceSection, marketplaceOrigin],
  )
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>
}

export function useNavigation() {
  const ctx = useContext(NavigationContext)
  if (!ctx) throw new Error("useNavigation must be used within a NavigationProvider")
  return ctx
}
