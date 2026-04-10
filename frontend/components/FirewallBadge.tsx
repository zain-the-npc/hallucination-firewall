// FirewallBadge.tsx
"use client"

interface Props { status: string }

const CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  PASSED:      { label: "Verified",       color: "#22C55E", bg: "rgba(34,197,94,0.10)",   border: "rgba(34,197,94,0.20)"   },
  VERIFIED:    { label: "Verified",       color: "#22C55E", bg: "rgba(34,197,94,0.10)",   border: "rgba(34,197,94,0.20)"   },
  CORRECTED:   { label: "Corrected",      color: "#6366F1", bg: "rgba(99,102,241,0.12)",  border: "rgba(99,102,241,0.25)"  },
  FLAGGED:     { label: "Flagged",        color: "#F59E0B", bg: "rgba(245,158,11,0.10)",  border: "rgba(245,158,11,0.20)"  },
  FAILED:      { label: "High Risk",      color: "#EF4444", bg: "rgba(239,68,68,0.10)",   border: "rgba(239,68,68,0.20)"   },
  SKIPPED:     { label: "Conversational", color: "#A1A1AA", bg: "rgba(161,161,170,0.08)", border: "rgba(161,161,170,0.15)" },
  CHAT:        { label: "Chat",           color: "#A1A1AA", bg: "rgba(161,161,170,0.08)", border: "rgba(161,161,170,0.15)" },
  UNAVAILABLE: { label: "Unavailable",    color: "#F59E0B", bg: "rgba(245,158,11,0.10)",  border: "rgba(245,158,11,0.20)"  },
  UNKNOWN:     { label: "Unknown",        color: "#A1A1AA", bg: "rgba(161,161,170,0.08)", border: "rgba(161,161,170,0.15)" },
}

export default function FirewallBadge({ status }: Props) {
  const c = CONFIG[status] ?? CONFIG.UNKNOWN
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      padding: "3px 10px",
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: 99,
      color: c.color,
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: "0.5px",
      textTransform: "uppercase",
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: "50%",
        background: c.color, display: "inline-block", flexShrink: 0,
      }} />
      {c.label}
    </span>
  )
}