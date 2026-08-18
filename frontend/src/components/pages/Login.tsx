"use client"

import React, { useEffect, useState } from "react"
import {
  Fingerprint, Lock, Eye, EyeOff, ArrowRight, ShieldCheck, Sparkles, Users,
} from "lucide-react"

const GOOGLE_LOGIN_URL = "http://localhost:8000/api/v1/auth/google/login"

type Bubble = { top?: string; left?: string; right?: string; bottom?: string; size: number; color: string }
type Particle = { top: string; left: string; size: number; color: string; opacity: number; duration: number; delay: number }

const PARTICLES: Particle[] = [
  { top: "15%", left: "20%", size: 6, color: "#FFFFFF", opacity: 0.5, duration: 7, delay: 0 },
  { top: "30%", left: "70%", size: 4, color: "#FFD9A0", opacity: 0.6, duration: 9, delay: 1.2 },
  { top: "55%", left: "12%", size: 5, color: "#FFFFFF", opacity: 0.4, duration: 8, delay: 0.6 },
  { top: "68%", left: "60%", size: 7, color: "#FF9E7A", opacity: 0.5, duration: 10, delay: 2 },
  { top: "22%", left: "48%", size: 3, color: "#FFFFFF", opacity: 0.55, duration: 6.5, delay: 1.6 },
  { top: "80%", left: "35%", size: 5, color: "#FFD9A0", opacity: 0.45, duration: 8.5, delay: 0.3 },
  { top: "42%", left: "85%", size: 4, color: "#FFFFFF", opacity: 0.4, duration: 7.5, delay: 2.4 },
]

const OUTER_BUBBLES: Bubble[] = [
  { top: "-8%", left: "-6%", size: 260, color: "rgba(31,78,121,0.09)" },
  { top: "65%", left: "-4%", size: 200, color: "rgba(255,107,74,0.08)" },
  { top: "-6%", right: "-5%", size: 220, color: "rgba(245,166,35,0.08)" },
  { bottom: "-10%", right: "-6%", size: 300, color: "rgba(31,78,121,0.07)" },
]

const OUTER_PARTICLES: Particle[] = [
  { top: "12%", left: "8%", size: 6, color: "#1F4E79", opacity: 0.3, duration: 8, delay: 0 },
  { top: "78%", left: "6%", size: 5, color: "#FF6B4A", opacity: 0.35, duration: 9, delay: 1.5 },
  { top: "20%", left: "92%", size: 5, color: "#F5A623", opacity: 0.3, duration: 7.5, delay: 0.8 },
  { top: "85%", left: "90%", size: 6, color: "#1F4E79", opacity: 0.25, duration: 10, delay: 2.2 },
  { top: "50%", left: "3%", size: 4, color: "#FF6B4A", opacity: 0.3, duration: 8.5, delay: 1.1 },
  { top: "45%", left: "96%", size: 4, color: "#F5A623", opacity: 0.3, duration: 7, delay: 1.9 },
]

const RIGHT_PARTICLES: Particle[] = [
  { top: "18%", left: "85%", size: 5, color: "#FF6B4A", opacity: 0.25, duration: 8, delay: 0 },
  { top: "75%", left: "12%", size: 4, color: "#1F4E79", opacity: 0.18, duration: 9.5, delay: 1 },
  { top: "40%", left: "6%", size: 3, color: "#F5A623", opacity: 0.25, duration: 7, delay: 2 },
]

function GoogleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ marginRight: 8 }} aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

export function Login() {
  const [hrId, setHrId] = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const authError = params.get("auth_error")
    if (authError) {
      setError(`Sign-in failed (${authError}). Try Google again, or continue locally.`)
    }
  }, [])

  function handleGoogleLogin() {
    window.location.href = GOOGLE_LOGIN_URL
  }

  function handleLocalDemo() {
    localStorage.setItem("auth_token", "mock-jwt-token")
    window.location.assign("/chat")
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!hrId.trim() || !password.trim()) {
      setError("Enter your HR ID and password to continue.")
      return
    }
    setLoading(true)
    handleGoogleLogin()
  }

  return (
    <div style={P.page}>
      {OUTER_BUBBLES.map((b, i) => (
        <div
          key={i}
          className="cai-blob"
          style={{
            position: "absolute", top: b.top, left: b.left, right: b.right, bottom: b.bottom,
            width: b.size, height: b.size, borderRadius: "50%", background: b.color,
            filter: "blur(2px)", animationDuration: `${9 + i * 2}s`, animationDelay: `${i * 0.7}s`,
          }}
        />
      ))}
      {OUTER_PARTICLES.map((p, i) => (
        <span
          key={i}
          className="cai-particle"
          style={{
            position: "absolute", top: p.top, left: p.left, width: p.size, height: p.size,
            borderRadius: "50%", background: p.color, opacity: p.opacity,
            animationDuration: `${p.duration}s`, animationDelay: `${p.delay}s`,
          }}
        />
      ))}
      <div style={P.shell}>
        <div style={P.leftPanel}>
          <svg className="cai-rotate" style={{ position: "absolute", top: "50%", left: "50%", marginTop: -220, marginLeft: -220, opacity: 0.18 }} width="440" height="440" viewBox="0 0 440 440">
            <circle cx="220" cy="220" r="200" fill="none" stroke="#FFFFFF" strokeWidth="1" strokeDasharray="2 10" />
            <circle cx="220" cy="220" r="150" fill="none" stroke="#FFFFFF" strokeWidth="1" strokeDasharray="1 8" />
          </svg>
          <svg className="cai-blob" style={{ position: "absolute", top: -80, right: -100, opacity: 0.9 }} width="360" height="360" viewBox="0 0 360 360">
            <path fill="#FF6B4A" d="M180 20C260 30 340 90 340 180C340 270 260 340 180 340C100 340 20 280 20 190C20 100 100 10 180 20Z" opacity="0.35" />
          </svg>
          <svg className="cai-blob2" style={{ position: "absolute", bottom: -100, left: -80, opacity: 0.9 }} width="320" height="320" viewBox="0 0 320 320">
            <path fill="#F5A623" d="M160 10C240 20 310 90 300 170C290 250 210 310 130 300C50 290 10 210 20 130C30 50 80 0 160 10Z" opacity="0.4" />
          </svg>
          {PARTICLES.map((p, i) => (
            <span
              key={i}
              className="cai-particle"
              style={{
                position: "absolute", top: p.top, left: p.left, width: p.size, height: p.size,
                borderRadius: "50%", background: p.color, opacity: p.opacity,
                animationDuration: `${p.duration}s`, animationDelay: `${p.delay}s`,
              }}
            />
          ))}
          <div style={P.leftContent}>
            <div style={P.logoRow}><div style={P.logoMark}>C</div><span style={P.logoText}>ClosedAI</span></div>
            <h1 style={P.headline}>Your HR questions,<br />answered instantly.</h1>
            <p style={P.subhead}>Sign in with your Google account to chat with the Copilot — policies, leave balances, benefits, and onboarding, all in one place.</p>
            <div style={P.featureList}>
              <div style={P.featureItem}><div style={P.featureIcon}><ShieldCheck size={16} /></div><span>Answers grounded in verified company policy</span></div>
              <div style={P.featureItem}><div style={P.featureIcon}><Sparkles size={16} /></div><span>Powered by Azure OpenAI, secured by Google SSO</span></div>
              <div style={P.featureItem}><div style={P.featureIcon}><Users size={16} /></div><span>Built for every employee, every department</span></div>
            </div>
            <div style={P.badgeCard}>
              <div style={P.badgeStrap} />
              <div style={P.badgeInner}>
                <div style={P.badgeAvatar}><Fingerprint size={20} /></div>
                <div><div style={P.badgeName}>Employee Access</div><div style={P.badgeSub}>Verified via Google SSO</div></div>
              </div>
            </div>
          </div>
        </div>

        <div style={P.rightPanel}>
          <div style={P.rightGlowTop} />
          <div style={P.rightGlowBottom} />
          <svg style={{ position: "absolute", top: "8%", right: "10%", opacity: 0.35 }} width="120" height="120" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="55" fill="none" stroke="#1F4E79" strokeWidth="1" strokeDasharray="1 7" />
          </svg>
          {RIGHT_PARTICLES.map((p, i) => (
            <span
              key={i}
              className="cai-particle"
              style={{
                position: "absolute", top: p.top, left: p.left, width: p.size, height: p.size,
                borderRadius: "50%", background: p.color, opacity: p.opacity,
                animationDuration: `${p.duration}s`, animationDelay: `${p.delay}s`,
              }}
            />
          ))}
          <form onSubmit={handleSubmit} style={P.formWrap}>
            <div style={P.formHeaderRow}>
              <span style={P.eyebrow}>Welcome back</span>
              <h2 style={P.formTitle}>Sign in to your account</h2>
              <p style={P.formSub}>Use the HR ID issued to you at onboarding.</p>
            </div>
            <label style={P.label}>HR ID</label>
            <div style={P.inputRow}>
              <Fingerprint size={16} style={P.inputIcon} />
              <input className="cai-input" style={P.input} placeholder="e.g. CAI-04821" value={hrId} onChange={(e) => setHrId(e.target.value)} autoComplete="username" />
            </div>
            <label style={{ ...P.label, marginTop: 16 }}>Password</label>
            <div style={P.inputRow}>
              <Lock size={16} style={P.inputIcon} />
              <input className="cai-input" style={{ ...P.input, paddingRight: 38 }} type={showPw ? "text" : "password"} placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              <button type="button" className="cai-toggle" onClick={() => setShowPw((s) => !s)} style={P.toggleBtn} aria-label={showPw ? "Hide password" : "Show password"}>
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <div style={P.rowBetween}>
              <label style={P.checkboxRow}><input type="checkbox" style={{ accentColor: "#1F4E79" }} /> Remember this device</label>
              <a href="#" style={P.link}>Forgot password?</a>
            </div>
            {error && <div style={P.errorText}>{error}</div>}
            <button type="submit" className="cai-btn" style={P.submitBtn} disabled={loading}>
              {loading ? "Verifying..." : "Sign in"}{!loading && <ArrowRight size={16} />}
            </button>
            <div style={P.divider}><span style={P.dividerLine} /><span style={P.dividerText}>or</span><span style={P.dividerLine} /></div>
            <button type="button" style={P.ssoBtn} onClick={handleGoogleLogin}><GoogleIcon size={16} />Sign in with Google</button>
            <button type="button" style={{ ...P.ssoBtn, marginTop: 10 }} onClick={handleLocalDemo}>
              Continue locally
            </button>
            <p style={P.footerNote}>Trouble signing in? Contact <span style={{ color: "#1F4E79", fontWeight: 600 }}>IT Helpdesk</span>.</p>
          </form>
        </div>
      </div>
    </div>
  )
}

const P = {
  page: { minHeight: "100vh", width: "100%", background: "#F8F4E9", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, position: "relative", overflow: "hidden", fontFamily: "'Plus Jakarta Sans', sans-serif" },
  shell: { width: "100%", maxWidth: 980, minHeight: 600, display: "flex", borderRadius: 20, overflow: "hidden", boxShadow: "0 30px 60px -30px rgba(20,30,45,0.35)", background: "#FFFFFF", position: "relative", zIndex: 1 },
  leftPanel: { flex: "0 0 46%", position: "relative", background: "linear-gradient(160deg, #142F4B 0%, #1F4E79 55%, #2D6A9F 100%)", overflow: "hidden", padding: "44px 40px", display: "flex", flexDirection: "column", justifyContent: "center", color: "#FFFFFF" },
  leftContent: { position: "relative", zIndex: 2 },
  logoRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 40 },
  logoMark: { width: 32, height: 32, borderRadius: 9, background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 15, border: "1px solid rgba(255,255,255,0.3)" },
  logoText: { fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em" },
  headline: { fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 30, lineHeight: 1.18, letterSpacing: "-0.01em", marginBottom: 14, maxWidth: 340 },
  subhead: { fontSize: 13.5, lineHeight: 1.6, opacity: 0.88, maxWidth: 320, marginBottom: 30 },
  featureList: { display: "flex", flexDirection: "column", gap: 12, marginBottom: 34 },
  featureItem: { display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, opacity: 0.95 },
  featureIcon: { width: 26, height: 26, borderRadius: 8, background: "rgba(255,255,255,0.16)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  badgeCard: { width: 210, background: "rgba(255,255,255,0.12)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.25)", padding: "14px 16px", backdropFilter: "blur(6px)" },
  badgeStrap: { width: 26, height: 4, borderRadius: 4, background: "rgba(255,255,255,0.5)", marginBottom: 10 },
  badgeInner: { display: "flex", alignItems: "center", gap: 10 },
  badgeAvatar: { width: 34, height: 34, borderRadius: 9, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" },
  badgeName: { fontSize: 12.5, fontWeight: 600 },
  badgeSub: { fontSize: 10.5, opacity: 0.75, marginTop: 1 },
  rightPanel: { flex: 1, padding: "48px 46px", display: "flex", flexDirection: "column", justifyContent: "center", position: "relative", overflow: "hidden" },
  rightGlowTop: { position: "absolute", top: -80, right: -60, width: 260, height: 260, borderRadius: "50%", background: "radial-gradient(circle, rgba(31,78,121,0.08), transparent 70%)", pointerEvents: "none" },
  rightGlowBottom: { position: "absolute", bottom: -100, left: -80, width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,107,74,0.07), transparent 70%)", pointerEvents: "none" },
  formWrap: { width: "100%", maxWidth: 340, margin: "0 auto", position: "relative", zIndex: 2 },
  formHeaderRow: { marginBottom: 26 },
  eyebrow: { fontSize: 11, fontWeight: 600, color: "#1F4E79", letterSpacing: "0.06em", textTransform: "uppercase" },
  formTitle: { fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 22, color: "#16233A", marginTop: 6, marginBottom: 6 },
  formSub: { fontSize: 12.5, color: "#5B6B7C" },
  label: { fontSize: 12, fontWeight: 600, color: "#374559", display: "block", marginBottom: 6 },
  inputRow: { position: "relative", display: "flex", alignItems: "center" },
  inputIcon: { position: "absolute", left: 12, color: "#94A3B8" },
  input: { width: "100%", padding: "11px 12px 11px 36px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13.5, fontFamily: "'Plus Jakarta Sans', sans-serif", background: "#FBFCFE", color: "#16233A" },
  toggleBtn: { position: "absolute", right: 10, background: "none", border: "none", color: "#94A3B8", opacity: 0.75, cursor: "pointer", display: "flex" },
  rowBetween: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 },
  checkboxRow: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#5B6B7C" },
  link: { fontSize: 12, color: "#1F4E79", fontWeight: 600, textDecoration: "none" },
  errorText: { fontSize: 12, color: "#E0455A", marginTop: 12, fontWeight: 500 },
  submitBtn: { width: "100%", marginTop: 22, padding: "12px 0", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #FF6B4A, #F5834F)", color: "#FFFFFF", fontSize: 13.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 10px 20px -8px rgba(255,107,74,0.5)", transition: "all 0.15s ease" },
  divider: { display: "flex", alignItems: "center", gap: 10, margin: "22px 0" },
  dividerLine: { flex: 1, height: 1, background: "#EAEEF3" },
  dividerText: { fontSize: 11, color: "#94A3B8" },
  ssoBtn: { width: "100%", padding: "11px 0", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#FFFFFF", color: "#374559", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  footerNote: { fontSize: 11.5, color: "#94A3B8", textAlign: "center", marginTop: 22 },
} satisfies Record<string, React.CSSProperties>
