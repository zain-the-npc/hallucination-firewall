"use client"

import { useEffect, useState } from "react"
import { fetchLogs, fetchStats } from "../../lib/api"
import Link from "next/link"
import ReactMarkdown from 'react-markdown'

interface Log {
  id:                  string
  created_at:          string
  user_question:       string
  gpt_raw_answer:      string
  hallucination_score: number
  status:              string
  corrected_answer?:   string | null
  sources?:            string[]
  model_version?:      string
}

interface Stats {
  total:                    number
  passed:                   number
  flagged:                  number
  corrected:                number
  avg_hallucination_score:  number
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { color: string; bg: string }> = {
    PASSED:    { color: "#00FF88", bg: "rgba(0,255,136,0.1)"   },
    VERIFIED:  { color: "#00FF88", bg: "rgba(0,255,136,0.1)"   },
    CORRECTED: { color: "#00F5FF", bg: "rgba(0,245,255,0.1)"  },
    FLAGGED:   { color: "#FFB800", bg: "rgba(255,184,0,0.1)"  },
    FAILED:    { color: "#FF4444", bg: "rgba(255,68,68,0.1)"   },
  }
  const c = map[status] ?? { color: "#6B8A9A", bg: "rgba(107,138,154,0.1)" }
  return (
    <span style={{
      padding: "3px 10px", borderRadius: 99,
      background: c.bg, color: c.color,
      border: `1px solid ${c.color}44`,
      fontSize: 10, fontWeight: 600,
      letterSpacing: "1px", textTransform: "uppercase",
      fontFamily: "var(--font-mono)",
      boxShadow: `0 0 8px ${c.bg}`,
    }}>
      {status}
    </span>
  )
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 0.08 ? "#FF4444" : score >= 0.05 ? "#FFB800" : "#00FF88"
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div className="hallucination-bar-track" style={{ width: 72, margin: 0 }}>
        <div className="hallucination-bar-fill" style={{
          width: `${Math.min(100, Math.round(score * 100 * 12))}%`,
        }} />
      </div>
      <span style={{
        fontSize: 11, fontFamily: "var(--font-mono)",
        color, fontWeight: 600, minWidth: 30,
      }}>
        {Math.round(score * 100)}%
      </span>
    </div>
  )
}

export default function Dashboard() {
  const [logs,    setLogs]    = useState<Log[]>([])
  const [stats,   setStats]   = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [readme,  setReadme]  = useState<string>("")
  const [readmeExpanded, setReadmeExpanded] = useState(false)
  const [benchmark, setBenchmark] = useState<any>(null)
  const [benchmarkExpanded, setBenchmarkExpanded] = useState(false)

  useEffect(() => {
    Promise.all([
      fetchLogs(100), 
      fetchStats(), 
      fetch('/api/readme').then(r => r.json()),
      fetch('/api/benchmark').then(r => r.json()).catch(() => null)
    ])
      .then(([l, s, r, b]) => { 
        setLogs(l.logs || [])
        setStats(s)
        if (r && r.content) setReadme(r.content)
        if (b && !b.error) setBenchmark(b)
      })
      .catch((err) => {
        console.error(err)
        // Fallback mock data so dashboard looks good even if backend isn't seeded
        setStats({ total: 0, passed: 0, flagged: 0, corrected: 0, avg_hallucination_score: 0 })
        setLogs([])
      })
      .finally(() => setLoading(false))
  }, [])

  const detectionRate = stats && stats.total > 0
    ? Math.round(((stats.flagged + stats.corrected) / stats.total) * 100)
    : 0

  const STAT_CARDS = [
    {
      label: "Total Queries",
      value: stats?.total ?? 0,
      color: "var(--text)",
      sub: "all time",
    },
    {
      label: "Passed",
      value: stats?.passed ?? 0,
      color: "var(--green)",
      sub: "no issues detected",
    },
    {
      label: "Flagged / Corrected",
      value: (stats?.flagged ?? 0) + (stats?.corrected ?? 0),
      color: "var(--amber)",
      sub: `${detectionRate}% detection rate`,
    },
    {
      label: "Avg Risk Score",
      value: stats ? `${Math.round((stats.avg_hallucination_score ?? 0) * 100)}%` : "—",
      color: (stats?.avg_hallucination_score ?? 0) >= 0.5 ? "var(--amber)" : "var(--green)",
      sub: "hallucination probability",
    },
  ]

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg)",
      color: "var(--text)",
      fontFamily: "'DM Sans', sans-serif",
    }}>
      {/* Topbar */}
      <div style={{
        borderBottom: "1px solid var(--border-glow)",
        background: "rgba(13,17,23,0.95)",
        backdropFilter: "blur(20px)",
        padding: "12px 28px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 6,
            background: "linear-gradient(135deg, var(--accent-cyan), #0080FF)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 16px rgba(0,245,255,0.3)",
          }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M6.5 1L11.5 4V9L6.5 12L1.5 9V4L6.5 1Z" stroke="#000" strokeWidth="1.2" strokeLinejoin="round"/>
              <circle cx="6.5" cy="6.5" r="1.5" fill="#000"/>
            </svg>
          </div>
          <div>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>VerifyAI</span>
            <span style={{ marginLeft: 10, fontSize: 12, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>/ analytics</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <a href="#readme" style={{ textDecoration: "none", fontSize: 12, color: "var(--text-2)", fontWeight: 500 }}
             onClick={() => setReadmeExpanded(true)}>README</a>
          <Link href="/" style={{ textDecoration: "none" }}>
            <button className="btn-ghost" style={{ fontSize: 12 }}>← Back to Chat</button>
          </Link>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 28px" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 className="display" style={{ fontSize: 26, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
            Research Analytics
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-2)" }}>
            Hallucination detection events, correction history, and model performance.
          </p>
        </div>

        {/* Stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
          {STAT_CARDS.map(c => (
            <div key={c.label} className="score-card">
              <p className="label" style={{ marginBottom: 10, textAlign: "left" }}>{c.label}</p>
              <p style={{
                fontFamily: "var(--font-mono)",
                fontSize: 28, fontWeight: 700,
                color: c.color, lineHeight: 1, marginBottom: 6,
                textShadow: `0 0 20px ${c.color}66`,
              }}>
                {loading ? "—" : c.value}
              </p>
              <p style={{ fontSize: 11, color: "var(--text-secondary)", textAlign: "left" }}>{c.sub}</p>
            </div>
          ))}
        </div>

        {/* Model info card */}
        <div className="response-card" style={{ padding: "16px 20px", marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <p className="label" style={{ marginBottom: 6 }}>Classifier Model</p>
              <p style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500, fontFamily: "var(--font-display)" }}>
                DistilBERT · <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--accent-cyan)" }}>zain-the-npc/hallucination-firewall</span>
              </p>
            </div>
            <div style={{ display: "flex", gap: 18 }}>
              {[
                { label: "F1 Score",  value: "0.962" },
                { label: "Accuracy",  value: "96.1%" },
                { label: "Dataset",   value: "22k samples" },
                { label: "Threshold", value: "0.75" },
              ].map(m => (
                <div key={m.label} style={{ textAlign: "center" }}>
                  <p className="label" style={{ marginBottom: 4 }}>{m.label}</p>
                  <p style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 14, fontWeight: 600, color: "var(--accent-cyan)",
                    textShadow: "0 0 10px rgba(0,245,255,0.4)",
                  }}>
                    {m.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Benchmark Results Section */}
        {benchmark && benchmark.metrics && (
          <div className="response-card" style={{ padding: 0, marginBottom: 28 }}>
            <div 
              onClick={() => setBenchmarkExpanded(!benchmarkExpanded)}
              style={{
                padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
                cursor: "pointer", borderBottom: benchmarkExpanded ? "1px solid var(--border-glow)" : "none",
              }}
            >
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)" }}>Evaluation Benchmark Results</p>
              <span style={{ color: "var(--text-3)", transform: benchmarkExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                ▼
              </span>
            </div>
            
            {benchmarkExpanded && (
              <div style={{ padding: "20px" }}>
                <p style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 16 }}>
                  Results from 50 hardcoded query evaluations (25 factual, 25 hallucinations).
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
                  <div className="score-card" style={{ padding: 12 }}>
                    <p className="label">Accuracy</p>
                    <p style={{ fontSize: 20, fontWeight: 700, color: "var(--accent-cyan)", fontFamily: "var(--font-mono)" }}>
                      {(benchmark.metrics.accuracy * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div className="score-card" style={{ padding: 12 }}>
                    <p className="label">Precision</p>
                    <p style={{ fontSize: 20, fontWeight: 700, color: "var(--accent-cyan)", fontFamily: "var(--font-mono)" }}>
                      {benchmark.metrics.precision.toFixed(3)}
                    </p>
                  </div>
                  <div className="score-card" style={{ padding: 12 }}>
                    <p className="label">Recall</p>
                    <p style={{ fontSize: 20, fontWeight: 700, color: "var(--accent-cyan)", fontFamily: "var(--font-mono)" }}>
                      {benchmark.metrics.recall.toFixed(3)}
                    </p>
                  </div>
                  <div className="score-card" style={{ padding: 12 }}>
                    <p className="label">F1 Score</p>
                    <p style={{ fontSize: 20, fontWeight: 700, color: "var(--accent-cyan)", fontFamily: "var(--font-mono)" }}>
                      {benchmark.metrics.f1_score.toFixed(3)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Logs table */}
        <div className="response-card" style={{ overflow: "hidden", padding: 0 }}>
          <div style={{
            padding: "14px 18px", borderBottom: "1px solid var(--border-glow)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Request Logs</p>
            <p style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>Last 100 queries</p>
          </div>

          {loading ? (
            <div style={{ padding: 18 }}>
              {[1,2,3,4,5].map(i => (
                <div key={i} className="skeleton" style={{ height: 36, borderRadius: 6, marginBottom: 6 }} />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div style={{ padding: "40px 18px", textAlign: "center" }}>
              <p style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 8 }}>No queries logged yet.</p>
              <p style={{ fontSize: 12, color: "var(--text-3)" }}>
                Start asking questions in <Link href="/" style={{ color: "var(--accent)", textDecoration: "none" }}>Verified Research</Link> mode.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--surface-2)" }}>
                    {["Question", "Risk Score", "Status", "Corrected", "Time"].map(h => (
                      <th key={h} style={{
                        padding: "10px 14px", textAlign: "left",
                        fontSize: 10, fontWeight: 600, color: "var(--text-3)",
                        letterSpacing: "0.1em", textTransform: "uppercase",
                        borderBottom: "1px solid var(--border)",
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, i) => (
                    <tr key={log.id}
                      style={{
                        borderBottom: i < logs.length - 1 ? "1px solid var(--border)" : "none",
                        transition: "background 0.1s",
                      }}
                      onMouseOver={e => (e.currentTarget as HTMLElement).style.background = "var(--surface-2)"}
                      onMouseOut={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                    >
                      <td style={{ padding: "11px 14px", maxWidth: 280 }}>
                        <p style={{
                          fontSize: 12, color: "var(--text)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {log.user_question}
                        </p>
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        <ScoreBar score={log.hallucination_score} />
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        <StatusPill status={log.status} />
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        {log.corrected_answer ? (
                          <span style={{
                            fontSize: 11, color: "var(--green)",
                            fontFamily: "'DM Mono', monospace",
                          }}>Yes</span>
                        ) : (
                          <span style={{ fontSize: 11, color: "var(--text-3)" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "'DM Mono', monospace" }}>
                          {new Date(log.created_at).toLocaleString([], {
                            month: "short", day: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Project Documentation Section */}
        <div id="readme" style={{
          marginTop: 40,
          background: "var(--bg-3)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          overflow: "hidden",
        }}>
          <div 
            onClick={() => setReadmeExpanded(!readmeExpanded)}
            style={{
              padding: "18px 24px", 
              display: "flex", alignItems: "center", justifyContent: "space-between",
              cursor: "pointer",
              borderBottom: readmeExpanded ? "1px solid var(--border)" : "none",
              background: "var(--bg-4)"
            }}
          >
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-1)" }}>Project Documentation</p>
            <span style={{ color: "var(--text-3)", transform: readmeExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
              ▼
            </span>
          </div>
          
          {readmeExpanded && (
            <div style={{ padding: "32px", fontSize: 14, color: "var(--text-2)", lineHeight: 1.7 }} className="markdown-body">
              <ReactMarkdown>{readme}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
      <style>{`
        .markdown-body h1, .markdown-body h2, .markdown-body h3 {
          color: var(--text-1);
          margin-top: 1.5em;
          margin-bottom: 0.5em;
          font-weight: 600;
        }
        .markdown-body h1 { fontSize: 24px; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
        .markdown-body h2 { fontSize: 20px; }
        .markdown-body h3 { fontSize: 16px; }
        .markdown-body p { margin-bottom: 1em; }
        .markdown-body ul, .markdown-body ol { margin-left: 20px; margin-bottom: 1em; }
        .markdown-body li { margin-bottom: 4px; }
        .markdown-body pre {
          background: var(--bg-2);
          padding: 16px;
          border-radius: 8px;
          overflow-x: auto;
          margin-bottom: 1em;
          border: 1px solid var(--border);
        }
        .markdown-body code {
          font-family: var(--font-mono);
          background: var(--bg-2);
          padding: 2px 5px;
          border-radius: 4px;
          font-size: 0.9em;
        }
        .markdown-body pre code { background: none; padding: 0; }
      `}</style>
    </div>
  )
}