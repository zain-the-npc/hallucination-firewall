"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../lib/supabase"
import { getSessions, deleteSession } from "../lib/sessions"

interface Session { id: string; title: string; updated_at: string; mode?: string }

interface Props {
  currentSessionId: string | null
  onSelectSession:  (id: string) => void
  onNewChat:        () => void
  userId:           string
  user:             any
  isOpen?:          boolean
  onClose?:         () => void
}

export default function Sidebar({ currentSessionId, onSelectSession, onNewChat, userId, user, isOpen, onClose }: Props) {
  const [sessions,  setSessions]  = useState<Session[]>([])
  const [loading,   setLoading]   = useState(true)
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

  return (
    <aside className={`fixed inset-y-0 left-0 z-50 flex flex-col py-6 px-4 h-screen w-64 bg-[#1c1b1b] transition-transform duration-300 md:translate-x-0 ${isOpen ? "translate-x-0" : "-translate-x-full"}`}>
      <div className="flex items-center gap-3 px-2 mb-10">
        <div className="w-8 h-8 bg-primary rounded-sm flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-on-primary text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>shield_person</span>
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight text-[#ffffff] leading-none">VerifyAI</h1>
          <p className="text-[10px] uppercase tracking-[0.05em] text-on-surface-variant font-medium mt-1">High-Stakes Analysis</p>
        </div>
      </div>
      
      <button onClick={onNewChat} className="mb-8 w-full py-2.5 px-4 bg-primary text-on-primary font-bold text-sm rounded-sm flex items-center justify-center gap-2 hover:opacity-90 transition-all active:scale-[0.98] duration-150 shrink-0 border-none outline-none focus:outline-none focus:ring-0 min-h-[44px]">
        <span className="material-symbols-outlined text-sm">add</span>
        New Analysis
      </button>

      <nav className="flex-1 space-y-4 overflow-y-auto w-full pr-1 overflow-x-hidden">
        {loading ? (
          <div className="space-y-3 px-2">
            {[1,2,3,4].map(i => (
              <div key={i} className="w-full h-8 bg-surface-container rounded-sm animate-pulse" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-[11px] text-[#c6c6c6] text-center mt-4">No analysis history found.</p>
        ) : (
          Object.entries(groups).map(([g, items]) => !items.length ? null : (
            <div key={g} className="mb-6">
              <p className="text-[10px] uppercase tracking-[0.05em] text-on-surface-variant font-semibold mb-2 px-2">
                {g}
              </p>
              <div className="space-y-1">
                {items.map(s => (
                  <div
                    key={s.id}
                    onClick={() => onSelectSession(s.id)}
                    className={`flex items-center justify-between px-3 py-2 min-h-[44px] text-xs font-medium rounded-sm cursor-pointer group transition-colors duration-150 ${currentSessionId === s.id ? "bg-[#353534] text-[#ffffff]" : "text-[#c6c6c6] hover:bg-[#2a2a2a]"}`}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <span className="material-symbols-outlined text-[16px] opacity-70 shrink-0" style={{ fontVariationSettings: "'FILL' 0" }}>history</span>
                      <span className="truncate">{s.title}</span>
                    </div>
                    <button
                      onClick={e => handleDelete(e, s.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400 shrink-0 ml-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </nav>

      <div className="mt-auto pt-6 border-t border-outline-variant/10 shrink-0 cursor-pointer" onClick={signOut}>
        <div className="flex items-center gap-3 px-2 hover:bg-surface-container p-2 rounded-sm transition-colors">
          <div className="w-8 h-8 rounded-full bg-surface-container-highest overflow-hidden flex items-center justify-center text-[10px] font-bold text-on-surface border border-outline-variant/20">
             {(user?.user_metadata?.full_name || user?.email || "U")?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-xs font-semibold text-on-surface truncate">{user?.user_metadata?.full_name || user?.email || "Senior Analyst"}</p>
            <p className="text-[10px] text-on-surface-variant truncate">Enterprise Tier · Logout</p>
          </div>
          <span className="material-symbols-outlined text-on-surface-variant text-sm">logout</span>
        </div>
      </div>
    </aside>
  )
}