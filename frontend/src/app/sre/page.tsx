"use client"

import { useEffect, useState, useCallback } from "react"
import { Activity, RefreshCw } from "lucide-react"

const BACKEND_URL = process.env.NEXT_PUBLIC_HRAGENT_API_URL || "http://localhost:8000"
const CHECK_INTERVAL_MS = 15000

const BG = "#0F1319"
const CARD = "#181D26"
const BORDER = "#2A3140"
const TEXT = "#E5E9EE"
const TEXT_MUTED = "#7A8794"
const GREEN = "#4ADE80"
const RED = "#F5576C"
const AMBER = "#F5A623"
const CORAL = "#FF6B4A"

type HealthState = "checking" | "healthy" | "unhealthy"

interface HealthCheck {
  timestamp: number
  status: HealthState
  responseTimeMs: number | null
}

// Example data — no real error-logging/monitoring backend exists yet, so
// this section is illustrative only, clearly distinct from the real health
// checks tracked above it.
const EXAMPLE_ERROR_RATES = [
  { endpoint: "/api/v1/chat/stream", rate: "0.4%" },
  { endpoint: "/api/v1/actions/execute", rate: "1.2%" },
  { endpoint: "/health", rate: "0.0%" },
]

// Semicircle gauge, matching the reference's style (colored arc, big number
// centered below). Built with plain SVG stroke-dasharray, no chart library.
function Gauge({ label, value, max, unit, good }: { label: string; value: number | null; max: number; unit: string; good: (v: number) => boolean }) {
  const pct = value !== null ? Math.min(value / max, 1) : 0
  const radius = 54
  const circumference = Math.PI * radius // semicircle
  const offset = circumference * (1 - pct)
  const color = value === null ? TEXT_MUTED : good(value) ? GREEN : RED

  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 10px" }}>{label}</p>
      <svg width="140" height="76" viewBox="0 0 140 76">
        <path d="M 13 70 A 54 54 0 0 1 127 70" fill="none" stroke="#2A3140" strokeWidth="10" strokeLinecap="round" />
        <path
          d="M 13 70 A 54 54 0 0 1 127 70"
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.3s ease" }}
        />
      </svg>
      <p style={{ fontSize: 22, fontWeight: 700, color: TEXT, margin: "-6px 0 0" }}>
        {value !== null ? `${value}${unit}` : "N/A"}
      </p>
    </div>
  )
}

// Real line graph of response time across this session's actual checks —
// built with a plain SVG polyline, no chart library needed for this scale.
function ResponseTimeChart({ history }: { history: HealthCheck[] }) {
  const points = [...history].reverse().filter((h) => h.responseTimeMs !== null)
  if (points.length < 2) {
    return <p style={{ fontSize: 12.5, color: TEXT_MUTED, padding: "40px 0", textAlign: "center" }}>Collecting data — need at least 2 checks to graph.</p>
  }
  const values = points.map((p) => p.responseTimeMs as number)
  const max = Math.max(...values, 10)
  const min = Math.min(...values, 0)
  const range = max - min || 1
  const w = 800
  const h = 160
  const stepX = w / (points.length - 1)

  const coords = values.map((v, i) => {
    const x = i * stepX
    const y = h - ((v - min) / range) * (h - 20) - 10
    return `${x},${y}`
  })
  const linePath = "M " + coords.join(" L ")
  const areaPath = `M 0,${h} L ${coords.join(" L ")} L ${w},${h} Z`

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id="respGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={CORAL} stopOpacity="0.35" />
          <stop offset="100%" stopColor={CORAL} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#respGrad)" />
      <path d={linePath} fill="none" stroke={CORAL} strokeWidth="2" />
    </svg>
  )
}

function StatusDot({ status }: { status: HealthState }) {
  const color = status === "healthy" ? GREEN : status === "unhealthy" ? RED : TEXT_MUTED
  return <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 999, background: color }} />
}

export default function SreDashboardPage() {
  const [mounted, setMounted] = useState(false)
  const [current, setCurrent] = useState<HealthCheck>({ timestamp: 0, status: "checking", responseTimeMs: null })
  const [history, setHistory] = useState<HealthCheck[]>([])

  useEffect(() => {
    setMounted(true)
  }, [])

  const runCheck = useCallback(async () => {
    const start = performance.now()
    try {
      const res = await fetch(`${BACKEND_URL}/health`, { cache: "no-store" })
      const elapsed = Math.round(performance.now() - start)
      const check: HealthCheck = { timestamp: Date.now(), status: res.ok ? "healthy" : "unhealthy", responseTimeMs: elapsed }
      setCurrent(check)
      setHistory((prev) => [check, ...prev].slice(0, 30))
    } catch {
      const elapsed = Math.round(performance.now() - start)
      const check: HealthCheck = { timestamp: Date.now(), status: "unhealthy", responseTimeMs: elapsed }
      setCurrent(check)
      setHistory((prev) => [check, ...prev].slice(0, 30))
    }
  }, [])

  useEffect(() => {
    runCheck()
    const interval = setInterval(runCheck, CHECK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [runCheck])

  const healthyCount = history.filter((h) => h.status === "healthy").length
  const uptimePct = history.length > 0 ? Math.round((healthyCount / history.length) * 100) : null
  const responseTimes = history.filter((h) => h.responseTimeMs !== null).map((h) => h.responseTimeMs as number)
  const avgResponseTime = responseTimes.length > 0 ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) : null
  const maxResponseTime = responseTimes.length > 0 ? Math.max(...responseTimes) : null

  return (
    <div style={{ minHeight: "100vh", background: BG, color: TEXT, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      {/* Top bar, echoing the reference's toolbar */}
      <div style={{ borderBottom: `1px solid ${BORDER}`, padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 7, background: "#1F2733" }}>
            <Activity size={15} color={CORAL} />
          </span>
          <h1 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>HR Copilot — Backend Health</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 12, color: TEXT_MUTED }}>
          <span>Target: {BACKEND_URL}</span>
          <span style={{ color: AMBER, display: "flex", alignItems: "center", gap: 5 }}>
            <RefreshCw size={11} />
            Refresh every 15s
          </span>
          <button
            onClick={runCheck}
            style={{ background: "#1F2733", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "5px 12px", fontSize: 12, color: TEXT, cursor: "pointer" }}
          >
            Check now
          </button>
        </div>
      </div>

      <div style={{ padding: "20px 24px", maxWidth: 1200, margin: "0 auto" }}>
        {/* Headline cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
          {[
            { label: "Current Status", value: current.status === "healthy" ? "Healthy" : current.status === "unhealthy" ? "Down" : "…", color: current.status === "healthy" ? GREEN : current.status === "unhealthy" ? RED : TEXT_MUTED },
            { label: "Avg Response Time", value: avgResponseTime !== null ? `${avgResponseTime}ms` : "—", color: TEXT },
            { label: "Max Response Time", value: maxResponseTime !== null ? `${maxResponseTime}ms` : "—", color: TEXT },
            { label: "Checks (session)", value: String(history.length), color: TEXT },
          ].map((c) => (
            <div key={c.label} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "16px 18px" }}>
              <p style={{ fontSize: 10.5, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 8px", fontWeight: 600 }}>{c.label}</p>
              <p style={{ fontSize: 24, fontWeight: 700, margin: 0, color: c.color }}>{c.value}</p>
            </div>
          ))}
        </div>

        {/* Gauges */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 12 }}>
          <Gauge label="Uptime" value={uptimePct} max={100} unit="%" good={(v) => v >= 95} />
          <Gauge label="Response Time" value={avgResponseTime} max={500} unit="ms" good={(v) => v <= 200} />
          <Gauge label="Checks Healthy" value={history.length > 0 ? healthyCount : null} max={Math.max(history.length, 1)} unit={`/${history.length}`} good={() => healthyCount === history.length} />
        </div>

        {/* Response time graph + recent checks table */}
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12, marginBottom: 12 }}>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 18 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 12px" }}>
              Response Time (real, this session)
            </p>
            <ResponseTimeChart history={history} />
          </div>

          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 18 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 12px" }}>
              Recent Checks
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 0, maxHeight: 160, overflowY: "auto" }}>
              {history.length === 0 && <p style={{ fontSize: 12, color: TEXT_MUTED }}>No checks yet.</p>}
              {history.slice(0, 8).map((h, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: i < 7 ? `1px solid ${BORDER}` : "none", fontSize: 12 }}>
                  <StatusDot status={h.status} />
                  <span style={{ color: TEXT_MUTED, flex: 1 }}>{mounted ? new Date(h.timestamp).toLocaleTimeString() : "—"}</span>
                  <span style={{ color: TEXT }}>{h.responseTimeMs}ms</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Example error rates table, matching the reference's table style */}
        <div style={{ background: CARD, border: `1px dashed #4A4030`, borderRadius: 10, padding: 18 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: AMBER, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 4px" }}>
            Error Rates by Endpoint — Example Data
          </p>
          <p style={{ fontSize: 11, color: TEXT_MUTED, margin: "0 0 14px" }}>
            No error-logging backend exists yet — illustrative only, not real.
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                <th style={{ textAlign: "left", padding: "6px 0", color: TEXT_MUTED, fontWeight: 600 }}>Endpoint</th>
                <th style={{ textAlign: "right", padding: "6px 0", color: TEXT_MUTED, fontWeight: 600 }}>Error Rate</th>
              </tr>
            </thead>
            <tbody>
              {EXAMPLE_ERROR_RATES.map((e) => (
                <tr key={e.endpoint} style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <td style={{ padding: "8px 0", color: TEXT }}>{e.endpoint}</td>
                  <td style={{ padding: "8px 0", textAlign: "right", color: AMBER }}>{e.rate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
