
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../lib/supabase"
import { deleteSession } from "../lib/sessions"

interface Session { id: string; title: string; updated_at: string; mode?: string }

interface Props {
  currentSessionId: string | null
  onSelectSession: (id: string) => void
  onNewChat: () => void
  userId: string
  user: any
  isOpen?: boolean
  onClose?: () => void
}

export default function Sidebar({ currentSessionId, onSelectSession, onNewChat, userId, user, isOpen, onClose }: Props) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    if (!user) return
    const fetchSessions = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('chat_sessions')
        .select('id, title, updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(30)
      if (!error && data) setSessions(data as Session[])
      setLoading(false)
    }
    fetchSessions()
  }, [user])

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
    const now = new Date()
    const yday = new Date(now); yday.setDate(yday.getDate() - 1)
    const week = new Date(now); week.setDate(week.getDate() - 7)
    const out: Record<string, Session[]> = { Today: [], Yesterday: [], "This week": [], Older: [] }
    sessions.forEach(s => {
      const d = new Date(s.updated_at)
      if (d.toDateString() === now.toDateString()) out.Today.push(s)
      else if (d.toDateString() === yday.toDateString()) out.Yesterday.push(s)
      else if (d > week) out["This week"].push(s)
      else out.Older.push(s)
    })
    return out
  }

  const groups = group(sessions)

  const SessionItem = ({ s }: { s: Session }) => (
    <div
      key={s.id}
      onClick={() => onSelectSession(s.id)}
      className={`flex items-center gap-3 p-3 mx-3 rounded-lg hover:bg-white/5 cursor-pointer transition-colors group ${currentSessionId === s.id ? 'bg-white/5 text-white' : 'text-white/40 hover:text-white/70'
        }`}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 opacity-60">
        <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span className="truncate text-xs font-medium">{s.title}</span>
      <button
        onClick={e => handleDelete(e, s.id)}
        className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400 shrink-0 ml-auto"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  )

  return (
    <aside
      id="sidebar"
      className={`fixed inset-y-0 left-0 z-50 flex flex-col transition-transform duration-300 md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      style={{ width: '240px', background: '#080A0E', borderRight: '1px solid rgba(255,255,255,0.05)', height: '100dvh' }}
    >
      {/* Logo + close */}
      <div className="flex items-center justify-between p-6 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 border border-white/20 rounded flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div>
            <p className="text-xs font-bold text-white tracking-[0.15em] uppercase">VerifyAI</p>
            <p className="text-[10px] text-emerald-400/70">Cognitive Audit Engine •</p>
          </div>
        </div>
        <button onClick={onClose} className="text-white/30 hover:text-white transition-colors p-1">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* New Analysis */}
      <div className="px-4 pb-4">
        <button
          onClick={onNewChat}
          className="w-full py-2.5 px-4 bg-white text-black font-bold text-sm rounded-md flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] transition-all min-h-[44px]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Analysis
        </button>
      </div>

      {/* History */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden" style={{ minHeight: 0 }}>
        {loading ? (
          <div className="space-y-2 px-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="w-full h-8 rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-[11px] text-white/30 text-center mt-6 px-4">No analysis history found.</p>
        ) : (
          <div className="space-y-4 pb-4">
            {Object.entries(groups).map(([label, items]) =>
              items.length === 0 ? null : (
                <div key={label}>
                  <p className="px-6 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.15em] text-white/20">{label}</p>
                  <div className="space-y-0.5">
                    {items.map(s => <SessionItem key={s.id} s={s} />)}
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </nav>

      {/* User / Logout */}
      <div className="p-6 border-t flex items-center justify-between" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-emerald-400" style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)' }}>
            {(user?.user_metadata?.full_name || user?.email || "U")?.[0]?.toUpperCase()}
          </div>
          <div>
            <p className="text-xs font-bold text-white">{user?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'User'}</p>
            <p className="text-[10px] text-white/40">Enterprise Tier</p>
          </div>
        </div>
        <button onClick={signOut} className="text-white/40 hover:text-white transition-colors p-1" title="Logout">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
        </button>
      </div>
    </aside>
  )
}