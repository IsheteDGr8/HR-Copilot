interface AgentAvatarProps {
  jacket: string
  collar: string
  hair: string
  skin: string
  style: "short" | "bun" | "swoop" | "cap" | "curly"
}

export function AgentAvatar({ jacket, collar, hair, skin, style }: AgentAvatarProps) {
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" preserveAspectRatio="xMidYMax slice">
      <path d="M40 200 L52 138 Q100 118 148 138 L160 200 Z" fill={jacket} />
      <path d="M86 138 L100 118 L100 156 Z" fill={collar} />
      <path d="M114 138 L100 118 L100 156 Z" fill={collar} />
      <rect x="46" y="150" width="22" height="5" rx="2.5" fill="#FFFFFF" opacity="0.85" transform="rotate(-8 57 152)" />
      <rect x="46" y="160" width="22" height="5" rx="2.5" fill="#FFFFFF" opacity="0.85" transform="rotate(-8 57 162)" />
      <rect x="118" y="150" width="16" height="20" rx="3" fill="#FFFFFF" opacity="0.9" />
      <circle cx="126" cy="157" r="3" fill={jacket} opacity="0.6" />
      <rect x="90" y="108" width="20" height="20" fill={skin} />
      <circle cx="100" cy="82" r="36" fill={skin} />
      {style === "short" && <path d="M62 76 Q64 40 100 40 Q136 40 138 76 Q120 58 100 58 Q80 58 62 76 Z" fill={hair} />}
      {style === "bun" && (
        <>
          <path d="M60 78 Q60 42 100 42 Q140 42 140 78 Q124 60 100 60 Q76 60 60 78 Z" fill={hair} />
          <circle cx="100" cy="34" r="12" fill={hair} />
        </>
      )}
      {style === "swoop" && <path d="M60 74 Q66 36 106 38 Q142 40 138 72 Q118 48 96 52 Q74 56 60 74 Z" fill={hair} />}
      {style === "cap" && (
        <>
          <path d="M58 70 Q60 38 100 38 Q140 38 142 70 L142 58 Q100 44 58 58 Z" fill={hair} />
          <ellipse cx="100" cy="58" rx="44" ry="7" fill={hair} />
        </>
      )}
      {style === "curly" && (
        <>
          <circle cx="70" cy="58" r="14" fill={hair} />
          <circle cx="90" cy="44" r="16" fill={hair} />
          <circle cx="112" cy="44" r="16" fill={hair} />
          <circle cx="130" cy="58" r="14" fill={hair} />
          <circle cx="100" cy="40" r="15" fill={hair} />
        </>
      )}
      <circle cx="86" cy="84" r="10" fill="none" stroke="#22293A" strokeWidth="2.5" />
      <circle cx="114" cy="84" r="10" fill="none" stroke="#22293A" strokeWidth="2.5" />
      <line x1="96" y1="84" x2="104" y2="84" stroke="#22293A" strokeWidth="2.5" />
    </svg>
  )
}
