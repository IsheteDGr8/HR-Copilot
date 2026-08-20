import {
  Briefcase, UserPlus, DollarSign, Target, Heart, TrendingUp,
  BookOpen, Users, Award, Compass, Megaphone, LogOut,
} from "lucide-react"

const TILES = [
  { name: "Recruiting", sub: "Screening candidates", grad: "linear-gradient(135deg,#3AB88F,#237A5C)", Icon: Briefcase },
  { name: "Onboarding", sub: "5 new hires this week", grad: "linear-gradient(135deg,#FFB84D,#E08A00)", Icon: UserPlus },
  { name: "Compensation", sub: "Benchmarking roles", grad: "linear-gradient(135deg,#FF8563,#E0492A)", Icon: DollarSign },
  { name: "Performance", sub: "Q3 reviews open", grad: "linear-gradient(135deg,#FFB84D,#E08A00)", Icon: Target },
  { name: "Engagement", sub: "Pulse survey live", grad: "linear-gradient(135deg,#3AB88F,#237A5C)", Icon: Heart },
  { name: "Succession", sub: "Key roles mapped", grad: "linear-gradient(135deg,#FF8563,#E0492A)", Icon: TrendingUp },
  { name: "Learning & Dev", sub: "12 courses assigned", grad: "linear-gradient(135deg,#3AB88F,#237A5C)", Icon: BookOpen },
  { name: "Retention", sub: "Risk flags reviewed", grad: "linear-gradient(135deg,#FFB84D,#E08A00)", Icon: Users },
  { name: "Employer Brand", sub: "Campaign live", grad: "linear-gradient(135deg,#FF8563,#E0492A)", Icon: Award },
  { name: "Culture", sub: "Values workshop", grad: "linear-gradient(135deg,#3AB88F,#237A5C)", Icon: Compass },
  { name: "Talent Mapping", sub: "Market scan done", grad: "linear-gradient(135deg,#FFB84D,#E08A00)", Icon: Megaphone },
  { name: "Offboarding", sub: "Exit interview set", grad: "linear-gradient(135deg,#FF8563,#E0492A)", Icon: LogOut },
]

function buildRow(rowIndex: number) {
  const rowTiles = Array.from({ length: 8 }, (_, i) => TILES[(rowIndex * 3 + i) % TILES.length])
  return [...rowTiles, ...rowTiles]
}

function SkillCard({ tile }: { tile: (typeof TILES)[number] }) {
  const { name, sub, grad, Icon } = tile
  return (
    <div
      style={{
        borderRadius: 14,
        padding: "9px 16px 9px 9px",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: grad,
        boxShadow: "0 8px 20px -8px rgba(20,30,45,0.22), inset 0 1px 0 rgba(255,255,255,0.25)",
      }}
    >
      <span
        style={{
          width: 34, height: 34, borderRadius: 9, background: "rgba(255,255,255,0.22)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.3)",
        }}
      >
        <Icon size={16} color="#fff" strokeWidth={2.2} />
      </span>
      <span>
        <p style={{ fontSize: 11.5, fontWeight: 700, color: "#fff", margin: "0 0 2px" }}>{name}</p>
        <p style={{ fontSize: 9.5, color: "rgba(255,255,255,0.88)", margin: 0 }}>{sub}</p>
      </span>
    </div>
  )
}

export function SkillsShowcase() {
  return (
    <section id="skills" style={{ maxWidth: 1400, margin: "0 auto", padding: "64px 24px" }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#FF6B4A", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Deep expertise, not guesswork
        </span>
        <h2 style={{ fontWeight: 800, fontSize: 30, color: "#16233A", margin: "8px 0 0", letterSpacing: "-0.01em" }}>
          100+ real HR skills, always on call
        </h2>
      </div>

      <div
        style={{
          position: "relative", borderRadius: 24, overflow: "hidden", minHeight: 340,
          background: "linear-gradient(180deg, #F8F6EF 0%, #F1EEE3 100%)",
          border: "1px solid #EAE3D0", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)",
        }}
      >
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 12, padding: "12px 0" }}>
          {[0, 1, 2, 3].map((rowIndex) => (
            <div key={rowIndex} className={`cai-skill-row cai-skill-row-${rowIndex + 1}`}>
              {buildRow(rowIndex).map((tile, i) => (
                <SkillCard key={i} tile={tile} />
              ))}
            </div>
          ))}
        </div>

        <div
          style={{
            position: "absolute", inset: 0,
            background: "radial-gradient(ellipse at center, rgba(244,243,238,0.1) 0%, rgba(244,243,238,0.5) 55%, rgba(244,243,238,0.88) 100%)",
          }}
        />

        <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 340 }}>
          <div style={{ position: "relative", textAlign: "center", padding: 2 }}>
            <div
              style={{
                position: "absolute", inset: 0, borderRadius: 18, padding: 1.5,
                background: "linear-gradient(135deg, rgba(255,107,74,0.5), rgba(31,78,121,0), rgba(46,158,124,0.4))",
                WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                WebkitMaskComposite: "xor",
                maskComposite: "exclude",
              }}
            />
            <div
              style={{
                padding: "22px 30px", background: "rgba(255,255,255,0.68)",
                backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", borderRadius: 18,
                boxShadow: "0 24px 60px -18px rgba(20,30,45,0.28), 0 2px 8px rgba(20,30,45,0.06)",
              }}
            >
              <div className="cai-glow-number" style={{ fontSize: 44, fontWeight: 800, color: "#142F4B", letterSpacing: "-0.02em", lineHeight: 1 }}>
                100
                <span
                  style={{
                    background: "linear-gradient(135deg,#FF6B4A,#F5A623)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  +
                </span>
              </div>
              <p style={{ fontSize: 12, color: "#5B6B7C", marginTop: 6, fontWeight: 500, maxWidth: 200 }}>
                Real, specialized HR skills — running live behind the scenes.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
