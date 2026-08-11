"use client"

import { useMemo, useState } from "react"
import {
  MoreHorizontal,
  Pencil,
  Eye,
  Trash2,
  Copy,
  Zap,
  RefreshCw,
  Plus,
  Store,
  Plug,
  Loader2,
  WifiOff,
  SearchX,
  KeyRound,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  PageContainer,
  PageHeader,
  ItemCard,
  SearchBar,
  SegmentedTabs,
  ConfirmDialog,
} from "@/components/management/shared"
import { McpDetailPanel } from "./mcp-detail"
import { McpConnectionDialog } from "./mcp-dialogs"
import { McpSetupDialog } from "./mcp-setup-dialog"
import type { McpConnection } from "./mcp-types"
import { useMcp } from "@/lib/mcp-store"
import { useNavigation } from "@/lib/navigation"

type StatusFilter = "all" | "connected" | "disconnected"

export function McpConnectionsPage() {
  const {
    connections,
    dataSource,
    catalog,
    testingId,
    reconnectingId,
    rotatingId,
    toggleConnection,
    testConnection,
    reconnectConnection,
    disconnectAll,
    deleteConnection,
    duplicateConnection,
    upsertConnection,
    updateTool,
    saveConfig,
    setApiKey,
    rotateAuth,
    revokeAuth,
  } = useMcp()
  const { setView } = useNavigation()

  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<StatusFilter>("all")

  const [detailId, setDetailId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<McpConnection | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<McpConnection | null>(null)
  const [disconnectAllOpen, setDisconnectAllOpen] = useState(false)
  const [setupConnId, setSetupConnId] = useState<string | null>(null)

  // Skeleton shows only while the backend load is genuinely in flight —
  // never a fixed timer. Once dataSource leaves "loading", render whatever
  // the backend returned (empty list included).
  const loading = dataSource === "loading"

  const detail = useMemo(() => connections.find((c) => c.id === detailId) ?? null, [connections, detailId])

  const counts = useMemo(
    () => ({
      all: connections.length,
      connected: connections.filter((c) => c.connected).length,
      disconnected: connections.filter((c) => !c.connected).length,
    }),
    [connections],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return connections.filter((c) => {
      const matchesQuery = !q || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
      const matchesStatus =
        status === "all" || (status === "connected" && c.connected) || (status === "disconnected" && !c.connected)
      return matchesQuery && matchesStatus
    })
  }, [connections, query, status])

  const openEdit = (conn: McpConnection) => {
    setEditing(conn)
    setCreateOpen(true)
  }

  // Setup drives the integration's credential schema (token/OAuth/env) against
  // its marketplace template. Custom servers have no schema — fall back to the
  // full Edit dialog for those.
  //
  // A connection's id is a server-template name, so the owning library is the
  // catalog entry that provides that server (matched by id first — plugin name
  // equals its template key for every current integration — then by which
  // library's templates contain the server, which survives multi-server libs).
  const setupConn = setupConnId ? (connections.find((c) => c.id === setupConnId) ?? null) : null
  const findSetupLib = (connId: string) =>
    catalog.find((l) => l.id === connId) ?? catalog.find((l) => l.servers && connId in l.servers)
  const setupLib = setupConnId ? (findSetupLib(setupConnId) ?? null) : null
  const openSetup = (conn: McpConnection) => {
    if (findSetupLib(conn.id)) setSetupConnId(conn.id)
    else openEdit(conn)
  }

  return (
    <PageContainer>
      <PageHeader
        title="MCP servers"
        description="Connect Model Context Protocol servers so your agent can reach external tools and data. Manage connections, credentials, and tool permissions."
        action={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setView("marketplace")} className="gap-2">
              <Store className="h-4 w-4" />
              Browse marketplace
            </Button>
            <Button
              onClick={() => {
                setEditing(null)
                setCreateOpen(true)
              }}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Add custom server
            </Button>
          </div>
        }
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-md flex-1 sm:flex-none sm:min-w-64">
          <SearchBar value={query} onChange={setQuery} placeholder="Search servers..." />
        </div>
        <div className="flex items-center gap-2">
          {counts.connected > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDisconnectAllOpen(true)}
              className="h-9 gap-2 text-[13px] text-muted-foreground hover:text-destructive"
            >
              <WifiOff className="h-4 w-4" />
              Disconnect all
            </Button>
          )}
          <SegmentedTabs
            tabs={[
              { id: "all", label: "All", count: counts.all },
              { id: "connected", label: "Connected", count: counts.connected },
              { id: "disconnected", label: "Disconnected", count: counts.disconnected },
            ]}
            value={status}
            onChange={setStatus}
          />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[96px] animate-pulse rounded-xl border border-border/60 bg-card/30" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="dream-in flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-card/30 px-6 py-16 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-border/60 bg-secondary/60">
            {connections.length === 0 ? (
              <Plug className="h-5 w-5 text-muted-foreground" />
            ) : (
              <SearchX className="h-5 w-5 text-muted-foreground" />
            )}
          </span>
          <p className="mt-4 text-sm font-medium text-foreground">
            {connections.length === 0 ? "No MCP servers yet" : "No matching servers"}
          </p>
          <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
            {connections.length === 0
              ? "Install a server from the marketplace or add a custom endpoint to get started."
              : "Try a different search or status filter."}
          </p>
          {connections.length === 0 && (
            <Button variant="secondary" onClick={() => setView("marketplace")} className="mt-5 gap-2">
              <Store className="h-4 w-4" />
              Browse marketplace
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-2">
          {filtered.map((c) => (
            <ItemCard
              key={c.id}
              icon={<c.icon className="h-5 w-5 text-muted-foreground" />}
              name={c.name}
              description={c.description}
              enabled={c.connected}
              onToggle={() => toggleConnection(c.id)}
              onOpen={() => setDetailId(c.id)}
              toggle={
                c.setupNeeded ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openSetup(c)}
                    className="h-8 gap-2 border border-amber-500/25 bg-amber-500/10 text-[13px] text-amber-300 hover:bg-amber-500/15 hover:text-amber-200"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    Setup
                  </Button>
                ) : undefined
              }
              menu={
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      aria-label={`${c.name} options`}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onClick={() => setDetailId(c.id)}>
                      <Eye />
                      View details
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => testConnection(c.id)} disabled={testingId === c.id}>
                      {testingId === c.id ? <Loader2 className="animate-spin" /> : <Zap />}
                      Test connection
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => reconnectConnection(c.id)} disabled={reconnectingId === c.id}>
                      {reconnectingId === c.id ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                      Reconnect
                    </DropdownMenuItem>
                    {c.setupNeeded && (
                      <DropdownMenuItem onClick={() => openSetup(c)}>
                        <KeyRound />
                        Set up credentials
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => duplicateConnection(c)}>
                      <Copy />
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openEdit(c)}>
                      <Pencil />
                      Edit configuration
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(c)}>
                      <Trash2 />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              }
            />
          ))}
        </div>
      )}

      <McpDetailPanel
        connection={detail}
        onOpenChange={(open) => {
          if (!open) setDetailId(null)
        }}
        onToggle={toggleConnection}
        onTest={testConnection}
        onReconnect={reconnectConnection}
        onSetup={openSetup}
        onEdit={(c) => openEdit(c)}
        onDuplicate={duplicateConnection}
        onDelete={(c) => setDeleteTarget(c)}
        onUpdateTool={updateTool}
        onSaveConfig={saveConfig}
        onSetApiKey={setApiKey}
        onRotateAuth={rotateAuth}
        onRevokeAuth={revokeAuth}
        testing={testingId === detail?.id}
        reconnecting={reconnectingId === detail?.id}
        rotating={rotatingId === detail?.id}
      />

      <McpConnectionDialog open={createOpen} connection={editing} onOpenChange={setCreateOpen} onSave={upsertConnection} />

      <McpSetupDialog
        server={setupLib}
        connection={setupConn}
        onOpenChange={(open) => {
          if (!open) setSetupConnId(null)
        }}
        onEdit={(c) => {
          setSetupConnId(null)
          openEdit(c)
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Delete server"
        description={`"${deleteTarget?.name ?? ""}" will be removed. Connected tools stop working until you reinstall the server.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (!deleteTarget) return
          if (detailId === deleteTarget.id) setDetailId(null)
          deleteConnection(deleteTarget.id)
        }}
      />

      <ConfirmDialog
        open={disconnectAllOpen}
        onOpenChange={(open) => {
          if (!open) setDisconnectAllOpen(false)
        }}
        title="Disconnect all servers"
        description="Every connected MCP server will be disconnected. You can reconnect them individually at any time."
        confirmLabel="Disconnect all"
        onConfirm={disconnectAll}
      />
    </PageContainer>
  )
}
