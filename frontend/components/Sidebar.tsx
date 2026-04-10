"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../lib/supabase"
import { getSessions, deleteSession } from "../lib/sessions"
import Link from "next/link"

interface Session { id: string; title: string; updated_at: string; mode?: string }

interface Props {
  currentSessionId: string | null
  onSelectSession:  (id: string) => void
  onNewChat:        () => void
  userId:           string
  user:             any
}

const MODE_DOT: Record<string, string> = {
  firewall: "#6366F1",
  compare:  "#8B5CF6",
  chat:     "#52525B",
}

export default function Sidebar({ currentSessionId, onSelectSession, onNewChat, userId, user }: Props) {
  const [sessions,  setSessions]  = useState<Session[]>([])
  const [loading,   setLoading]   = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const router = useRouter()

  useEffect(() => { loadSessions() }, [userId])

  async function loadSessions() {
    try { setSessions((await getSessions(userId)) || []) }
    catch (e) { console.error(e) }
    finally   { setLoading(false) }
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    await deleteSession(id)
    setSessions(p => p.filter(s => s.id !== id))
    if (currentSessionId === id) onNewChat()
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.push("/auth")
  }

  function group(sessions: Session[]) {
    const now  = new Date()
    const yday = new Date(now); yday.setDate(yday.getDate() - 1)
    const week = new Date(now); week.setDate(week.getDate() - 7)
    const out: Record<string, Session[]> = { Today: [], Yesterday: [], "This week": [], Older: [] }
    sessions.forEach(s => {
      const d = new Date(s.updated_at)
      if (d.toDateString() === now.toDateString())        out.Today.push(s)
      else if (d.toDateString() === yday.toDateString())  out.Yesterday.push(s)
      else if (d > week)                                   out["This week"].push(s)
      else                                                 out.Older.push(s)
    })
    return out
  }

  const groups = group(sessions)

  if (collapsed) return (
    <div style={{
      width: 52, flexShrink: 0, background: "var(--bg-2)",
      borderRight: "1px solid var(--border)", display: "flex",
      flexDirection: "column", alignItems: "center", paddingTop: 12, gap: 8, height: "100vh",
    }}>
      <button onClick={() => setCollapsed(false)} className="btn-ghost"
        style={{ padding: 8, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="1" y="2"   width="12" height="1.5" rx=".75" fill="currentColor"/>
          <rect x="1" y="6.25" width="12" height="1.5" rx=".75" fill="currentColor"/>
          <rect x="1" y="10.5" width="12" height="1.5" rx=".75" fill="currentColor"/>
        </svg>
      </button>
      <button onClick={onNewChat} className="btn-ghost"
        style={{ padding: 8, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  )

  return (
    <div className="sidebar">
      {/* Header */}
      <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 24, height: 24, borderRadius: 6,
            background: "var(--accent)", display: "flex",
            alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1L10.5 3.5V8.5L6 11L1.5 8.5V3.5L6 1Z" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round"/>
              <circle cx="6" cy="6" r="1.5" fill="#fff"/>
            </svg>
          </div>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)" }}>VerifyAI</span>
        </div>
        <button onClick={() => setCollapsed(true)} className="btn-ghost"
          style={{ padding: "4px 8px", fontSize: 11, color: "var(--text-3)" }}>
          ←
        </button>
      </div>

      {/* New chat */}
      <div style={{ padding: "10px 12px 6px" }}>
        <button onClick={onNewChat} className="new-session-btn">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          New session
        </button>
      </div>

      {/* Sessions */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 10px 10px" }}>
        {loading ? (
          <div style={{ padding: "8px 0" }}>
            {[1,2,3,4].map(i => (
              <div key={i} className="skeleton" style={{ height: 32, marginBottom: 4, borderRadius: 8 }} />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--text-3)", textAlign: "center", marginTop: 24, lineHeight: 1.6 }}>
            No sessions yet.<br/>Start a conversation.
          </p>
        ) : (
          Object.entries(groups).map(([g, items]) => !items.length ? null : (
            <div key={g} style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 10, color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase",
                          padding: "8px 4px 4px", fontWeight: 600 }}>
                {g}
              </p>
              {items.map(s => (
                <div
                  key={s.id}
                  onClick={() => onSelectSession(s.id)}
                  className={`sidebar-session ${currentSessionId === s.id ? "active" : ""}`}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <span style={{
                      width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
                      background: MODE_DOT[s.mode || "chat"],
                      display: "inline-block",
                    }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{s.title}</span>
                  </span>
                  <button
                    onClick={e => handleDelete(e, s.id)}
                    style={{
                      background: "none", border: "none", color: "var(--text-3)",
                      cursor: "pointer", fontSize: 14, padding: "0 2px",
                      opacity: 0, transition: "opacity 0.1s", flexShrink: 0,
                    }}
                    className="del-btn"
                    onMouseOver={e => (e.currentTarget.style.color = "var(--red)")}
                    onMouseOut={e  => (e.currentTarget.style.color = "var(--text-3)")}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Nav + user */}
      <div style={{ borderTop: "1px solid var(--border)" }}>
        <Link href="/dashboard" style={{ textDecoration: "none" }}>
          <div className="sidebar-session" style={{ margin: "8px 10px", borderRadius: 8 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <rect x="1" y="1" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                <rect x="7" y="1" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                <rect x="1" y="7" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                <rect x="7" y="7" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
              </svg>
              Analytics
            </span>
          </div>
        </Link>
        <div style={{ padding: "8px 12px 14px", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            background: "var(--accent-soft)", border: "1px solid rgba(99,102,241,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, color: "var(--accent)", fontWeight: 700, flexShrink: 0,
          }}>
            {(user?.user_metadata?.full_name || user?.email || "U")[0].toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, color: "var(--text-1)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user?.user_metadata?.full_name || "User"}
            </p>
          </div>
          <button onClick={signOut} className="btn-ghost"
            style={{ padding: "4px 6px", fontSize: 12, color: "var(--text-3)" }}
            title="Sign out">⏻</button>
        </div>
      </div>

      <style>{`.sidebar-session:hover .del-btn, .sidebar-session.active .del-btn { opacity: 1 !important; }`}</style>
    </div>
  )
}