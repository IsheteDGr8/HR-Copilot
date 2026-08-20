"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowRight, ShieldCheck, Sparkles, Clock, X, Check, Rocket, Users,
  Handshake, Plus,
} from "lucide-react"
import { AgentAvatar } from "./agent-avatar"
import { SkillsShowcase } from "./skills-showcase"
import {
  SCENARIOS, MANUAL_PAINS, AI_WINS, PARTNERS, OFFICES,
  AVATAR_COLORS, AGENTS, SOLUTIONS_LINKS, RESOURCES_LINKS,
} from "@/lib/landing-content"

function WhyRecruitingIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64">
      <rect x="10" y="14" width="26" height="34" rx="4" fill="#FFD9A0" />
      <path d="M16 24 H30 M16 31 H30 M16 38 H24" stroke="#142F4B" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="46" cy="38" r="14" fill="#FF6B4A" />
      <path d="M40 38 L44 42 L52 33" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function WhySecureIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64">
      <path d="M32 8 L52 16 V30 C52 44 43 52 32 56 C21 52 12 44 12 30 V16 Z" fill="#142F4B" />
      <path d="M32 8 L52 16 V30 C52 44 43 52 32 56 Z" fill="#1F4E79" />
      <path d="M24 31 L30 37 L41 24" fill="none" stroke="#FFD9A0" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function WhyInstantIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="24" fill="#FFD9A0" />
      <path d="M34 14 L20 36 H30 L28 50 L46 26 H35 Z" fill="#FF6B4A" />
    </svg>
  )
}

const WHY_ITEMS = [
  {
    icon: <WhyRecruitingIcon />,
    title: "One pipeline for hiring",
    body: "Screen resumes, generate interview questions, and draft offer letters — the whole recruiting flow lives in one Copilot instead of scattered tools.",
  },
  {
    icon: <WhySecureIcon />,
    title: "Secure by design",
    body: "Built on Azure OpenAI and secured with Microsoft Entra ID, so access to company data stays governed the same way the rest of your org already trusts.",
  },
  {
    icon: <WhyInstantIcon />,
    title: "Answers without the wait",
    body: "No email, no ticket, no two-day turnaround — employees get accurate policy answers the moment they ask.",
  },
]

// Animated hero chat mockup — types out the question, shows a thinking
// pause, reveals the answer, holds, then resets and loops. Runs on a fixed
// cycle so it plays continuously like a short looping video clip.
const HERO_QUESTION = "How many leave days do I get?"
const HERO_CYCLE_MS = 6000

function AnimatedHeroMockup() {
  const [phase, setPhase] = useState<"typing" | "thinking" | "answered">("typing")
  const [typedChars, setTypedChars] = useState(0)

  useEffect(() => {
    let charTimer: ReturnType<typeof setInterval>
    let thinkingTimer: ReturnType<typeof setTimeout>
    let answeredTimer: ReturnType<typeof setTimeout>
    let resetTimer: ReturnType<typeof setTimeout>

    function runCycle() {
      setPhase("typing")
      setTypedChars(0)
      let i = 0
      charTimer = setInterval(() => {
        i += 1
        setTypedChars(i)
        if (i >= HERO_QUESTION.length) {
          clearInterval(charTimer)
        }
      }, 40)

      thinkingTimer = setTimeout(() => setPhase("thinking"), HERO_QUESTION.length * 40 + 300)
      answeredTimer = setTimeout(() => setPhase("answered"), HERO_QUESTION.length * 40 + 1300)
      resetTimer = setTimeout(runCycle, HERO_CYCLE_MS)
    }

    runCycle()
    return () => {
      clearInterval(charTimer)
      clearTimeout(thinkingTimer)
      clearTimeout(answeredTimer)
      clearTimeout(resetTimer)
    }
  }, [])

  const questionText = HERO_QUESTION.slice(0, typedChars)

  return (
    <div style={L.previewCard}>
      <div style={L.previewHeader}>
        <div style={{ display: "flex", gap: 5 }}>
          <span style={{ ...L.trafficDot, background: "#FF6B4A" }} />
          <span style={{ ...L.trafficDot, background: "#F5A623" }} />
          <span style={{ ...L.trafficDot, background: "#2E9E7C" }} />
        </div>
        <span style={L.previewHeaderLabel}>HR Copilot</span>
      </div>
      <div style={{ ...L.previewBody, minHeight: 148 }}>
        {typedChars > 0 && (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <div style={L.previewBubbleUser}>
              {questionText}
              {phase === "typing" && <span className="cai-pulse">|</span>}
            </div>
          </div>
        )}

        {phase === "thinking" && (
          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
            <span className="cai-pulse" style={{ ...L.typingDot, animationDelay: "0s" }} />
            <span className="cai-pulse" style={{ ...L.typingDot, animationDelay: "0.2s" }} />
            <span className="cai-pulse" style={{ ...L.typingDot, animationDelay: "0.4s" }} />
          </div>
        )}

        {phase === "answered" && (
          <div style={{ display: "flex", justifyContent: "flex-start", animation: "caiFadeInUp 0.4s ease" }}>
            <div>
              <div style={L.previewSourceTag}>LEAVE-POL §4.2</div>
              <div style={L.previewBubbleBot}>1.5 days/month, up to 24/year — 5 days carry over.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function LandingPage() {
  const router = useRouter()
  const [expandedAgent, setExpandedAgent] = useState<number | null>(null)
  const [scrollY, setScrollY] = useState(0)

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY)
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  function onSignIn() {
    router.push("/chat")
  }

  return (
    <div className="cai-shine-page" style={L.page}>
      {/* Snowy corner particles */}
      {[
        { top: 10, left: 20, size: 4, delay: 0, duration: 8 },
        { top: 40, left: 60, size: 3, delay: 1.5, duration: 9 },
        { top: 80, left: 30, size: 5, delay: 3, duration: 7 },
        { top: 20, left: 90, size: 3, delay: 0.8, duration: 8.5 },
        { top: 120, left: 45, size: 4, delay: 2.2, duration: 9.5 },
      ].map((p, i) => (
        <span
          key={`snow-tl-${i}`}
          className="cai-snow-particle"
          style={{ top: p.top, left: p.left, width: p.size, height: p.size, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s` }}
        />
      ))}
      {[
        { top: 10, right: 20, size: 4, delay: 0.5, duration: 8 },
        { top: 50, right: 55, size: 3, delay: 2, duration: 9 },
        { top: 90, right: 25, size: 5, delay: 1, duration: 7.5 },
        { top: 25, right: 85, size: 3, delay: 3.2, duration: 8.5 },
      ].map((p, i) => (
        <span
          key={`snow-tr-${i}`}
          className="cai-snow-particle"
          style={{ top: p.top, right: p.right, width: p.size, height: p.size, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s` }}
        />
      ))}
      {[
        { bottom: 10, left: 25, size: 4, delay: 1.2, duration: 8 },
        { bottom: 60, left: 55, size: 3, delay: 2.5, duration: 9 },
        { bottom: 100, left: 35, size: 5, delay: 0.3, duration: 7 },
      ].map((p, i) => (
        <span
          key={`snow-bl-${i}`}
          className="cai-snow-particle"
          style={{ bottom: p.bottom, left: p.left, width: p.size, height: p.size, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s` }}
        />
      ))}
      {[
        { bottom: 10, right: 25, size: 4, delay: 1.8, duration: 8 },
        { bottom: 55, right: 50, size: 3, delay: 0.6, duration: 9 },
        { bottom: 95, right: 30, size: 5, delay: 2.8, duration: 7.5 },
      ].map((p, i) => (
        <span
          key={`snow-br-${i}`}
          className="cai-snow-particle"
          style={{ bottom: p.bottom, right: p.right, width: p.size, height: p.size, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s` }}
        />
      ))}
      <nav style={L.nav}>
        <div style={L.navInner}>
          <div style={L.logoRow}>
            <div style={L.logoMark}>C</div>
            <span style={L.logoText}>ClosedAI <span style={{ fontWeight: 500, opacity: 0.6 }}>HR Copilot</span></span>
          </div>
          <div style={L.navLinks}>
            <a href="#agents" className="cai-nav-link" style={L.navLink}>Meet the team</a>
            <a href="#scenarios" className="cai-nav-link" style={L.navLink}>What it does</a>
            <a href="#about" className="cai-nav-link" style={L.navLink}>About us</a>
            <button style={L.navCta} onClick={onSignIn}>Sign in</button>
          </div>
        </div>
      </nav>

      <header style={L.hero}>
        <div style={L.heroLeft}>
          <div style={L.heroBadge}><Sparkles size={13} /> Built on Azure OpenAI &amp; Azure AI Search</div>
          <p style={L.trustLine}>Fast-growing teams trust ClosedAI with their HR questions.</p>
          <h1 style={L.heroTitle}>One place for every<br />HR question you have.</h1>
          <p style={L.heroSub}>
            ClosedAI&apos;s HR Copilot answers policy questions, guides onboarding, and
            supports managers — grounded in your company&apos;s real documents, not guesswork.
          </p>
          <div style={L.heroActions}>
            <button className="cai-cta" style={L.primaryBtn} onClick={onSignIn}>
              Sign in with HR ID <ArrowRight size={16} />
            </button>
            <a href="#scenarios" style={L.secondaryBtn}>See what it can do</a>
          </div>
          <div style={L.trustRow}>
            <div style={L.trustItem}><ShieldCheck size={14} /> Entra ID secured</div>
            <div style={L.trustItem}><Clock size={14} /> Available 24/7</div>
          </div>
          <div style={L.avatarRow}>
            <div style={L.avatarStack}>
              {AVATAR_COLORS.map((c, i) => (
                <div key={i} style={{ ...L.avatarDot, background: c, marginLeft: i === 0 ? 0 : -8 }}>
                  {["A", "R", "M", "S", "J"][i]}
                </div>
              ))}
            </div>
            <span style={L.avatarLabel}>Trusted by 500+ ClosedAI employees</span>
          </div>
        </div>

        <div style={L.heroRight}>
          <div style={{ position: "absolute", top: -30, right: -30, zIndex: 0, transform: `translateY(${scrollY * 0.08}px)` }}>
            <svg className="cai-blob" style={{ opacity: 0.5 }} width="180" height="180" viewBox="0 0 180 180">
              <circle cx="90" cy="90" r="90" fill="#FFD9A0" />
            </svg>
          </div>
          <div style={{ position: "absolute", bottom: -40, left: -30, zIndex: 0, transform: `translateY(${scrollY * -0.05}px)` }}>
            <svg className="cai-blob2" style={{ opacity: 0.5 }} width="150" height="150" viewBox="0 0 150 150">
              <circle cx="75" cy="75" r="75" fill="#FFC0B0" />
            </svg>
          </div>

          <AnimatedHeroMockup />
          <div style={L.floatBadge}>
            <Sparkles size={13} color="#FF6B4A" />
            <span>AI-verified answer</span>
          </div>
        </div>
      </header>

      <section style={L.section}>
        <div style={L.sectionHeader}>
          <span style={L.eyebrow}>Why a copilot, not email threads</span>
          <h2 style={L.sectionTitle}>What changes when HR has AI</h2>
        </div>
        <div style={L.compareGrid}>
          <div style={L.compareCard}>
            <div style={L.compareLabel}><span style={{ ...L.compareDot, background: "#C9D2DC" }} />Handling it manually</div>
            {MANUAL_PAINS.map((p, i) => (
              <div key={i} style={L.compareRow}>
                <X size={15} color="#A9B4C0" style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ color: "#5B6B7C" }}>{p}</span>
              </div>
            ))}
          </div>
          <div style={{ ...L.compareCard, background: "linear-gradient(180deg, #142F4B, #1F4E79)", border: "none" }}>
            <div style={{ ...L.compareLabel, color: "#fff" }}><span style={{ ...L.compareDot, background: "#FF6B4A" }} />With ClosedAI Copilot</div>
            {AI_WINS.map((p, i) => (
              <div key={i} style={L.compareRow}>
                <Check size={15} color="#FF9E7A" style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ color: "#fff" }}>{p}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/*
        Original 5-agent section — kept here, commented out, so it's easy to
        revert if the new skills showcase below isn't preferred:

        <section id="agents" style={L.section}>
          <div style={L.sectionHeader}>
            <span style={L.eyebrow}>Meet the team</span>
            <h2 style={L.sectionTitle}>Five specialist agents, one Copilot</h2>
          </div>
          <div style={L.agentGrid}>
            {AGENTS.map((a, i) => {
              const isOpen = expandedAgent === i
              return (
                <div key={i} className="cai-card" style={L.agentCard}>
                  <div style={{ ...L.agentImgWrap, background: `${a.jacket}14` }}>
                    <AgentAvatar {...a} />
                  </div>
                  <div style={L.agentFooter}>
                    <div>
                      <div style={L.agentName}>{a.name}</div>
                      <div style={L.agentRole}>{a.role}</div>
                    </div>
                    <button
                      onClick={() => setExpandedAgent(isOpen ? null : i)}
                      style={{ ...L.agentPlus, transform: isOpen ? "rotate(45deg)" : "rotate(0deg)" }}
                      aria-label={`More about ${a.name}`}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  {isOpen && <p style={L.agentDesc}>{a.desc}</p>}
                </div>
              )
            })}
          </div>
        </section>
      */}

      <SkillsShowcase />

      <section id="scenarios" style={{ ...L.section, position: "relative" }}>
        <div style={L.sectionHeader}>
          <span style={L.eyebrow}>How it helps</span>
          <h2 style={L.sectionTitle}>How employees use it every day</h2>
        </div>
        <div style={L.grid}>
          {SCENARIOS.map((s, i) => {
            const Icon = s.icon
            return (
              <div key={i} className="cai-card" style={L.card}>
                <div style={{ ...L.cardIcon, background: `${s.tint}1A`, color: s.tint }}><Icon size={20} /></div>
                <h3 style={L.cardTitle}>{s.title}</h3>
                <p style={L.cardDesc}>{s.desc}</p>
                <div style={L.cardBenefits}>
                  {s.benefits.map((b, j) => (
                    <div key={j} style={L.benefitRow}><span style={{ ...L.benefitDot, background: s.tint }} />{b}</div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section style={{ ...L.section, textAlign: "center" }}>
        <h2 style={L.whyTitle}>Why choose ClosedAI&apos;s HR Copilot?</h2>
        <div style={L.whyGrid}>
          {WHY_ITEMS.map((w, i) => (
            <div key={i} style={L.whyCol}>
              <div style={L.whyIconWrap}>{w.icon}</div>
              <h3 style={L.whyHeading}>{w.title}</h3>
              <p style={L.whyBody}>{w.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="about" style={{ ...L.section, background: "#EEEDE6", borderRadius: 24, padding: "56px 40px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", bottom: -30, right: -30, zIndex: 0, transform: `translateY(${scrollY * 0.04}px)` }}>
          <svg className="cai-blob" style={{ opacity: 0.4 }} width="150" height="150" viewBox="0 0 150 150">
            <circle cx="75" cy="75" r="75" fill="#FF6B4A" />
          </svg>
        </div>
        <div style={{ position: "absolute", top: -20, left: 40, zIndex: 0, transform: `translateY(${scrollY * -0.07}px)` }}>
          <svg className="cai-blob2" style={{ opacity: 0.3 }} width="100" height="100" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="50" fill="#1F4E79" />
          </svg>
        </div>
        <div style={L.sectionHeader}>
          <span style={L.eyebrow}>About us</span>
          <h2 style={L.sectionTitle}>Who&apos;s building this</h2>
        </div>
        <div style={L.aboutWrap}>
          <p style={L.aboutText}>
            ClosedAI is a startup founded in 2026 by seven engineers and HR
            practitioners focused on transforming how HR teams work. Our AI
            HR Copilot brings policies, employee information, documents, and
            everyday HR workflows together in one intelligent platform. It
            helps HR teams automate routine work, streamline onboarding,
            manage employee processes, and access the information they need
            — so they can spend less time managing processes and more time
            focusing on people.
          </p>
          <div style={L.statRow}>
            <div style={L.statCard}><Rocket size={18} color="#1F4E79" /><div style={L.statNum}>2026</div><div style={L.statLabel}>Founded</div></div>
            <div style={L.statCard}><Users size={18} color="#FF6B4A" /><div style={L.statNum}>7</div><div style={L.statLabel}>Founders</div></div>
            <div style={L.statCard}><Handshake size={18} color="#2E9E7C" /><div style={L.statNum}>2</div><div style={L.statLabel}>Strategic partners</div></div>
          </div>
          <div style={L.partnerLabel}>Partnered with</div>
          <div style={L.partnerGrid}>
            {PARTNERS.map((p, i) => {
              const Icon = p.icon
              return (
                <div key={i} className="cai-partner" style={L.partnerCard}>
                  <div style={L.partnerIcon}><Icon size={18} color="#142F4B" /></div>
                  <div>
                    <div style={L.partnerName}>{p.name}</div>
                    <div style={L.partnerRole}>{p.role}</div>
                    <p style={L.partnerBlurb}>{p.blurb}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section style={L.bottomCta}>
        <h2 style={L.bottomTitle}>Have a question right now?</h2>
        <p style={L.bottomSub}>Sign in with your HR ID and ask the Copilot directly.</p>
        <button className="cai-cta" style={L.primaryBtn} onClick={onSignIn}>Sign in <ArrowRight size={16} /></button>
      </section>

      <footer style={L.footerWrap}>
        <div style={L.officesRow}>
          <div style={L.footerCol}>
            <div style={L.footerColLabel}>SOLUTIONS</div>
            {SOLUTIONS_LINKS.map((link, i) => (
              <a key={i} href="#" className="cai-footer-link" style={L.footerLink}>{link}</a>
            ))}
          </div>
          <div style={L.footerCol}>
            <div style={L.footerColLabel}>RESOURCES</div>
            {RESOURCES_LINKS.map((link, i) => (
              <a key={i} href="#" className="cai-footer-link" style={L.footerLink}>{link}</a>
            ))}
          </div>
          {OFFICES.map((o, i) => (
            <div key={i} style={L.footerCol}>
              <div style={L.footerColLabel}>{o.city.toUpperCase()}</div>
              {o.lines.map((line, j) => (<div key={j} style={L.officeLine}>{line}</div>))}
            </div>
          ))}
        </div>
        <div style={L.legalRow}>
          <span style={L.legalCopy}>© {new Date().getFullYear()} ClosedAI, Inc.</span>
          <div style={L.legalLinks}>
            <a href="#" style={L.legalLink}>Security</a>
            <a href="#" style={L.legalLink}>Terms of Use</a>
            <a href="#" style={L.legalLink}>Privacy Policy</a>
            <a href="#" style={L.legalLink}>Accessibility Statement</a>
            <a href="#" style={L.legalLink}>Contact Us</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

const L: Record<string, React.CSSProperties> = {
  page: { background: "#F4F3EE", color: "#16233A", minHeight: "100vh", fontFamily: "var(--font-body), 'Plus Jakarta Sans', sans-serif", position: "relative" },
  nav: { borderBottom: "1px solid #EAE3D0", position: "sticky", top: 0, background: "rgba(244,243,238,0.9)", backdropFilter: "blur(6px)", zIndex: 10 },
  navInner: { maxWidth: 1400, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  logoRow: { display: "flex", alignItems: "center", gap: 9 },
  logoMark: { width: 28, height: 28, borderRadius: 8, background: "#142F4B", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13 },
  logoText: { fontWeight: 700, fontSize: 14.5 },
  navLinks: { display: "flex", alignItems: "center", gap: 22 },
  navLink: { fontSize: 13, color: "#5B6B7C", textDecoration: "none", fontWeight: 500, transition: "color 0.15s" },
  navCta: { fontSize: 13, fontWeight: 600, color: "#fff", background: "#142F4B", border: "none", padding: "8px 16px", borderRadius: 8, cursor: "pointer" },
  hero: { maxWidth: 1400, margin: "0 auto", padding: "64px 24px 56px", display: "flex", alignItems: "center", gap: 48, flexWrap: "wrap" },
  heroLeft: { flex: "1 1 420px", minWidth: 320 },
  heroBadge: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, color: "#1F4E79", background: "#E8EEF4", padding: "6px 12px", borderRadius: 999, marginBottom: 18 },
  trustLine: { fontWeight: 700, fontSize: 15, color: "#16233A", marginBottom: 14, letterSpacing: "-0.01em" },
  heroTitle: { fontWeight: 800, fontSize: 40, lineHeight: 1.14, letterSpacing: "-0.02em", marginBottom: 16 },
  heroSub: { fontSize: 15, color: "#5B6B7C", lineHeight: 1.6, maxWidth: 480, marginBottom: 28 },
  heroActions: { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 },
  primaryBtn: { display: "flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg, #FF6B4A, #F5834F)", color: "#fff", border: "none", padding: "12px 22px", borderRadius: 10, fontSize: 13.5, fontWeight: 600, cursor: "pointer", boxShadow: "0 10px 20px -8px rgba(255,107,74,0.5)", transition: "all 0.15s ease" },
  secondaryBtn: { display: "flex", alignItems: "center", padding: "12px 22px", borderRadius: 10, fontSize: 13.5, fontWeight: 600, color: "#16233A", border: "1.5px solid #EAE3D0", textDecoration: "none", background: "#fff" },
  trustRow: { display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 18 },
  trustItem: { display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#7C8A99", fontWeight: 500 },
  avatarRow: { display: "flex", alignItems: "center", gap: 10 },
  avatarStack: { display: "flex", alignItems: "center" },
  avatarDot: { width: 26, height: 26, borderRadius: "50%", border: "2px solid #F4F3EE", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" },
  avatarLabel: { fontSize: 11.5, color: "#7C8A99", fontWeight: 500 },
  heroRight: { flex: "1 1 340px", minWidth: 300, position: "relative", display: "flex", justifyContent: "center", alignItems: "center", minHeight: 300 },
  previewCard: { position: "relative", zIndex: 2, width: "100%", maxWidth: 340, background: "#fff", borderRadius: 16, border: "1px solid #EAE3D0", boxShadow: "0 24px 48px -24px rgba(20,30,45,0.35)", overflow: "hidden" },
  previewHeader: { display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: "1px solid #EEF2F6" },
  trafficDot: { width: 7, height: 7, borderRadius: 999, display: "inline-block" },
  previewHeaderLabel: { fontSize: 11.5, fontWeight: 600, color: "#5B6B7C", marginLeft: 4 },
  previewBody: { padding: 16, display: "flex", flexDirection: "column", gap: 10 },
  previewBubbleUser: { background: "#142F4B", color: "#fff", padding: "8px 12px", borderRadius: "10px 10px 3px 10px", fontSize: 12, maxWidth: "80%" },
  previewSourceTag: { display: "inline-block", fontSize: 9, fontWeight: 600, color: "#8A5A1E", background: "#FBE3B8", padding: "2px 7px", borderRadius: "5px 5px 0 0" },
  previewBubbleBot: { background: "#EEEDE6", color: "#16233A", padding: "8px 12px", borderRadius: "3px 10px 10px 10px", fontSize: 12, maxWidth: "85%" },
  typingDot: { width: 5, height: 5, borderRadius: 999, background: "#B7C0CC", display: "inline-block" },
  floatBadge: { position: "absolute", bottom: 8, right: 8, zIndex: 3, background: "#fff", border: "1px solid #EAE3D0", borderRadius: 999, padding: "6px 12px", fontSize: 11, fontWeight: 600, color: "#16233A", display: "flex", alignItems: "center", gap: 6, boxShadow: "0 10px 20px -10px rgba(20,30,45,0.3)" },
  section: { maxWidth: 1400, margin: "0 auto", padding: "20px 24px 80px" },
  sectionHeader: { textAlign: "center", marginBottom: 40 },
  eyebrow: { fontSize: 11, fontWeight: 600, color: "#1F4E79", letterSpacing: "0.06em", textTransform: "uppercase" },
  sectionTitle: { fontWeight: 800, fontSize: 24, marginTop: 8, letterSpacing: "-0.01em" },
  compareGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 },
  compareCard: { background: "#fff", border: "1px solid #EAE3D0", borderRadius: 16, padding: "26px 24px" },
  compareLabel: { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 700, color: "#16233A", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.03em" },
  compareDot: { width: 7, height: 7, borderRadius: 999 },
  compareRow: { display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, padding: "8px 0", borderTop: "1px solid rgba(255,255,255,0.12)" },
  agentGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 },
  agentCard: { background: "#fff", border: "1px solid #EAE3D0", borderRadius: 16, overflow: "hidden", cursor: "default" },
  agentImgWrap: { width: "100%", aspectRatio: "1 / 1" },
  agentFooter: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px" },
  agentName: { fontWeight: 700, fontSize: 13 },
  agentRole: { fontSize: 10.5, color: "#7C8A99", marginTop: 1 },
  agentPlus: { width: 26, height: 26, borderRadius: 999, border: "1px solid #EAE3D0", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#374559", flexShrink: 0, transition: "transform 0.2s ease" },
  agentDesc: { fontSize: 11.5, color: "#5B6B7C", lineHeight: 1.5, padding: "0 14px 14px" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 },
  card: { background: "#fff", border: "1px solid #EAE3D0", borderRadius: 16, padding: "24px 22px", cursor: "default" },
  cardIcon: { width: 40, height: 40, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  cardTitle: { fontWeight: 600, fontSize: 15.5, marginBottom: 8 },
  cardDesc: { fontSize: 12.8, color: "#5B6B7C", lineHeight: 1.55, marginBottom: 16 },
  cardBenefits: { display: "flex", flexDirection: "column", gap: 8 },
  benefitRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#16233A", fontWeight: 500 },
  benefitDot: { width: 5, height: 5, borderRadius: 999, flexShrink: 0 },
  whyTitle: { fontWeight: 700, fontSize: 34, color: "#16233A", marginBottom: 44, letterSpacing: "-0.01em" },
  whyGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 32, maxWidth: 900, margin: "0 auto" },
  whyCol: { display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" },
  whyIconWrap: { marginBottom: 16 },
  whyHeading: { fontWeight: 700, fontSize: 19, color: "#16233A", marginBottom: 10 },
  whyBody: { fontSize: 13, color: "#5B6B7C", lineHeight: 1.65, maxWidth: 260 },
  aboutWrap: { maxWidth: 780, margin: "0 auto" },
  aboutText: { fontSize: 14, lineHeight: 1.75, color: "#41505F", textAlign: "center", marginBottom: 32 },
  statRow: { display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", marginBottom: 40 },
  statCard: { background: "#fff", border: "1px solid #EAE3D0", borderRadius: 14, padding: "18px 26px", textAlign: "center", minWidth: 140 },
  statNum: { fontWeight: 700, fontSize: 18, marginTop: 8 },
  statLabel: { fontSize: 11, color: "#7C8A99", marginTop: 2 },
  partnerLabel: { textAlign: "center", fontSize: 11, fontWeight: 600, color: "#7C8A99", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 16 },
  partnerGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 },
  partnerCard: { display: "flex", gap: 14, background: "#fff", border: "1px solid #EAE3D0", borderRadius: 14, padding: "18px 20px", transition: "transform 0.15s ease, box-shadow 0.15s ease" },
  partnerIcon: { width: 38, height: 38, borderRadius: 10, background: "#EEEDE6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  partnerName: { fontWeight: 700, fontSize: 14, marginBottom: 2 },
  partnerRole: { fontSize: 11, color: "#FF6B4A", fontWeight: 600, marginBottom: 8 },
  partnerBlurb: { fontSize: 12, color: "#5B6B7C", lineHeight: 1.55 },
  bottomCta: { textAlign: "center", padding: "56px 24px 64px", background: "linear-gradient(180deg, #F4F3EE, #EEEDE6)" },
  bottomTitle: { fontWeight: 700, fontSize: 22, marginBottom: 8 },
  bottomSub: { fontSize: 13.5, color: "#5B6B7C", marginBottom: 22 },
  footerWrap: { background: "#EEEDE6", borderTop: "1px solid #EAE3D0", marginTop: 24 },
  officesRow: { maxWidth: 1120, margin: "0 auto", padding: "48px 24px 40px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 32 },
  footerCol: { display: "flex", flexDirection: "column", gap: 10 },
  footerColLabel: { fontSize: 11.5, fontWeight: 700, color: "#16233A", letterSpacing: "0.04em", marginBottom: 4 },
  footerLink: { fontSize: 12.5, color: "#5B6B7C", textDecoration: "none" },
  officeLine: { fontSize: 12, color: "#5B6B7C", lineHeight: 1.6 },
  legalRow: { borderTop: "1px solid #EAE3D0", maxWidth: 1120, margin: "0 auto", padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 },
  legalCopy: { fontSize: 11.5, color: "#8B98A6" },
  legalLinks: { display: "flex", gap: 20, flexWrap: "wrap" },
  legalLink: { fontSize: 11.5, color: "#5B6B7C", textDecoration: "none", fontWeight: 500 },
}
