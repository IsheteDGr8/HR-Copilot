"use client"

import { useCallback, useContext, useEffect, useMemo, useRef, useState, createContext, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"

export type View =
  | "chat"
  | "skills"
  | "memory"
  | "settings"
  | "tools"
  | "mcp"
  | "marketplace"
  | "intake"
  | "work"
  | "payroll"
  | "automations"
  | "systems"

export type MarketplaceSection = "home" | "skills" | "mcp"

const VALID_VIEWS = new Set<View>([
  "chat",
  "skills",
  "memory",
  "settings",
  "tools",
  "mcp",
  "marketplace",
  "intake",
  "work",
  "payroll",
  "automations",
  "systems",
])

const PENDING_VIEW_KEY = "hr-nav-pending-view"

function readPendingView(): View | null {
  if (typeof window === "undefined") return null
  const v = sessionStorage.getItem(PENDING_VIEW_KEY)
  if (!v || !VALID_VIEWS.has(v as View)) return null
  sessionStorage.removeItem(PENDING_VIEW_KEY)
  return v as View
}

interface NavigationContextValue {
  view: View
  setView: (view: View) => void
  marketplaceSection: MarketplaceSection
  setMarketplaceSection: (s: MarketplaceSection) => void
  marketplaceOrigin: View
  selectedWorkId: string | null
  setSelectedWorkId: (id: string | null) => void
  selectedClusterId: string | null
  setSelectedClusterId: (id: string | null) => void
  navigateToWorkDetail: (workId: string) => void
  navigateToClusterDetail: (clusterId: string) => void
}

const NavigationContext = createContext<NavigationContextValue | null>(null)

export function NavigationProvider({
  children,
  initialView = "chat",
}: {
  children: ReactNode
  initialView?: View
}) {
  const [view, setView] = useState<View>(() => readPendingView() ?? initialView)
  const [marketplaceSection, setMarketplaceSection] = useState<MarketplaceSection>("home")
  const [marketplaceOrigin, setMarketplaceOrigin] = useState<View>("skills")
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null)
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null)
  const prevViewRef = useRef<View>(view)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (view === "marketplace" && prevViewRef.current !== "marketplace") {
      setMarketplaceOrigin(prevViewRef.current)
    }
    if (prevViewRef.current === "marketplace" && view !== "marketplace") {
      setMarketplaceSection("home")
    }
    prevViewRef.current = view
  }, [view])

  const handleSetView = useCallback(
    (v: View) => {
      if (v !== "work") setSelectedWorkId(null)
      if (v !== "intake") setSelectedClusterId(null)

      if (typeof window !== "undefined") {
        // Tools lives on its own route for OAuth callbacks.
        if (v === "tools" && !pathname?.startsWith("/tools")) {
          setView("tools")
          router.push("/tools")
          return
        }
        // Leaving /tools remounts NavigationProvider — stash target view first.
        if (v !== "tools" && pathname?.startsWith("/tools")) {
          sessionStorage.setItem(PENDING_VIEW_KEY, v)
          router.push("/chat")
          return
        }
      }

      setView(v)
    },
    [pathname, router],
  )

  const navigateToWorkDetail = useCallback((workId: string) => {
    setSelectedWorkId(workId)
    setView("work")
  }, [])

  const navigateToClusterDetail = useCallback((clusterId: string) => {
    setSelectedClusterId(clusterId)
    setView("intake")
  }, [])

  const value = useMemo(
    () => ({
      view,
      setView: handleSetView,
      marketplaceSection,
      setMarketplaceSection,
      marketplaceOrigin,
      selectedWorkId,
      setSelectedWorkId,
      selectedClusterId,
      setSelectedClusterId,
      navigateToWorkDetail,
      navigateToClusterDetail,
    }),
    [
      view,
      handleSetView,
      marketplaceSection,
      marketplaceOrigin,
      selectedWorkId,
      selectedClusterId,
      navigateToWorkDetail,
      navigateToClusterDetail,
    ],
  )
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>
}

export function useNavigation() {
  const ctx = useContext(NavigationContext)
  if (!ctx) throw new Error("useNavigation must be used within a NavigationProvider")
  return ctx
}
