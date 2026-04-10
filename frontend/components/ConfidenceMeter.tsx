"use client"
import { useEffect, useState } from "react"

interface Props { score: number; label: string }

export default function ConfidenceMeter({ score, label }: Props) {
  const pct = Math.round(score * 100)
  const [width, setWidth] = useState(0)

  useEffect(() => { setWidth(pct) }, [pct])

  const tier =
    score >= 0.08 ? { color: "#EF4444", name: "High Risk"   } :
    score >= 0.05 ? { color: "#F59E0B", name: "Medium Risk" } :
                   { color: "#22C55E", name: "Factual"     }

  return (
    <div style={{
      background: "var(--bg-3)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius)",
      padding: "16px 18px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span className="stat-label">Hallucination Risk</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: tier.color, fontWeight: 600 }}>{tier.name}</span>
          <span style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 700, color: tier.color }}>
            {pct}<span style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 400 }}>%</span>
          </span>
        </div>
      </div>
      <div className="risk-track">
        <div className="risk-fill" style={{ width: `${width}%` }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        <span style={{ fontSize: 10, color: "var(--text-3)" }}>Factual</span>
        <span style={{ fontSize: 10, color: "var(--text-3)" }}>Hallucinated</span>
      </div>
    </div>
  )
}