// ChatWindow.tsx new
"use client"

import { useEffect, useRef, useState } from "react"
import { createSession, getSession, updateSession, generateTitle } from "../lib/sessions"
import ConfidenceMeter from "./ConfidenceMeter"
import FirewallBadge from "./FirewallBadge"
import Link from "next/link"

type Mode = "chat" | "firewall" | "compare"
type Model = "gpt4" | "gemini"

interface Source { name: string; url: string; snippet: string }

interface Message {
  role: "user" | "assistant"
  question?: string
  gpt_raw_answer?: string | null
  gemini_raw_answer?: string | null
  hallucination_score?: number | null
  factual_score?: number | null
  gemini_score?: number | null
  confidence_label?: string | null
  status?: string
  gemini_status?: string | null
  corrected_answer?: string | null
  sources?: Source[]
  rag_used?: boolean
  rag_provider?: string | null
  gpt_verified?: boolean
  gpt_verdict?: string | null
  gpt_reasoning?: string | null
  mode?: Mode
  model_used?: string
  knowledge_panel?: any
  intent?: string | null
  winner?: string | null
  winner_reason?: string | null
  timestamp: string
}

interface Props {
  sessionId: string | null
  onSessionCreated: (id: string) => void
  userId: string
  user?: any
  onToggleSidebar?: () => void
}

const MODES = [
  { id: "chat" as Mode, label: "Quick Answer", desc: "Fast AI responses" },
  { id: "firewall" as Mode, label: "Verified Research", desc: "Full fact-check pipeline" },
  { id: "compare" as Mode, label: "Model Comparison", desc: "GPT-4 vs Groq, both scored" },
]

const EXAMPLES = [
  "How many bones does a shark have?",
  "Who invented the World Wide Web?",
  "What is the half-life of Carbon-14?",
  "When did the Berlin Wall fall?",
]

// ─── SSE stream helper ────────────────────────────────────────────────────────
async function askFirewallStream(
  question: string,
  mode: string,
  model: string,
  messages: any[],
  onStatus: (msg: string) => void
): Promise<any> {
  const response = await fetch("https://verifyai.up.railway.app/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, mode, model, messages }),
  })

  if (!response.ok) throw new Error(`Backend error: ${response.status}`)
  if (!response.body) throw new Error("No response body")

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let result: any = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() || ""   // keep incomplete line in buffer

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue
      try {
        const parsed = JSON.parse(line.slice(6))
        if (parsed.type === "status") {
          onStatus(parsed.message)
        } else if (parsed.type === "result") {
          result = parsed.data
        }
      } catch {
        // skip malformed lines
      }
    }
  }

  if (!result) throw new Error("No result received from stream")
  return result
}

// ─── Fallback non-streaming call ─────────────────────────────────────────────
async function askFirewallSync(question: string, mode: string, model: string, messages: any[]): Promise<any> {
  const response = await fetch("https://verifyai.up.railway.app/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, mode, model, messages }),
  })
  if (!response.ok) throw new Error(`Backend error: ${response.status}`)
  return response.json()
}


// ─── RiskBar component — animates width on mount ──────────────────────────────
function RiskBar({ score }: { score: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const pct = Math.min(score * 100, 100)
  const color = score < 0.15 ? '#10b981' : score < 0.5 ? '#f59e0b' : '#ef4444'
  useEffect(() => {
    const t = setTimeout(() => {
      if (ref.current) ref.current.style.width = `${pct}%`
    }, 200)
    return () => clearTimeout(t)
  }, [pct])
  return (
    <div ref={ref} className="h-full rounded-full" style={{
      width: '0%',
      background: color,
      boxShadow: score < 0.15 ? '0 0 12px rgba(16,185,129,0.5)' : score < 0.5 ? '0 0 12px rgba(245,158,11,0.4)' : '0 0 12px rgba(239,68,68,0.5)',
      transition: 'width 1.4s cubic-bezier(0.65,0,0.35,1)'
    }} />
  )
}

export default function ChatWindow({ sessionId, onSessionCreated, userId, user, onToggleSidebar }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [question, setQuestion] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>("chat")
  const [model, setModel] = useState<Model>("gpt4")
  const [statusMsg, setStatusMsg] = useState<string>("")   // live status
  const [statusHistory, setStatusHistory] = useState<string[]>([]) // all statuses
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (sessionId) loadSession()
    else setMessages([])
  }, [sessionId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading, statusMsg])

  async function loadSession() {
    if (!sessionId) return
    try { setMessages((await getSession(sessionId)).messages || []) }
    catch (e) { console.error(e) }
  }

  async function handleSubmit() {
    if (!question.trim() || loading) return
    const q = question.trim()
    setQuestion("")
    setLoading(true)
    setError(null)
    setStatusMsg("")
    setStatusHistory([])

    const userMsg: Message = { role: "user", question: q, mode, timestamp: new Date().toISOString() }
    const updated = [...messages, userMsg]
    setMessages(updated)

    try {
      const selectedModel = mode === "compare" ? "gpt4" : model

      const historyPayload = messages.map(m => {
        let content = m.role === "user" ? m.question
          : (m.corrected_answer || (m.model_used === "gemini" ? m.gemini_raw_answer : m.gpt_raw_answer));
        return { role: m.role, content: content || "" };
      });

      const data = await askFirewallStream(q, mode, selectedModel, historyPayload, (msg) => {
        setStatusMsg(msg)
        setStatusHistory(prev => [...prev, msg])
      })
      console.log("STREAM RESULT intent:", data.intent, "status:", data.status)

      const aMsg: Message = {
        role: "assistant",
        gpt_raw_answer: data.gpt_raw_answer,
        gemini_raw_answer: data.gemini_raw_answer,
        hallucination_score: data.hallucination_score,
        factual_score: data.factual_score,
        gemini_score: data.gemini_score,
        confidence_label: data.confidence_label,
        status: data.status,
        gemini_status: data.gemini_status,
        corrected_answer: data.corrected_answer,
        sources: data.sources,
        rag_used: data.rag_used,
        rag_provider: data.rag_provider,
        gpt_verified: data.gpt_verified,
        gpt_verdict: data.gpt_verdict,
        gpt_reasoning: data.gpt_reasoning,
        mode: data.mode,
        model_used: data.model_used,
        knowledge_panel: data.knowledge_panel,
        intent: data.intent,
        winner: data.winner,
        winner_reason: data.winner_reason,
        timestamp: new Date().toISOString(),
      }

      const final = [...updated, aMsg]
      setMessages(final)
      setStatusMsg("")

      if (sessionId) {
        await updateSession(sessionId, final)
      } else {
        const title = generateTitle(q)
        const s = await createSession(title, userId, mode)
        await updateSession(s.id, final, title)
        onSessionCreated(s.id)
      }
    } catch {
      setError("Could not reach backend. Ensure the server is running on :8000")
      setMessages(updated.slice(0, -1))
      setStatusMsg("")
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) handleSubmit()
  }



  /* ── sub-components ── */
  function Sources({ sources }: { sources: Source[] }) {
    const validSources = sources.filter(
      (src) => src.url && src.url !== "#" && src.name && src.name.toLowerCase() !== "no results found"
    )
    if (validSources.length === 0) return null
    return (
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
        <p className="label" style={{ marginBottom: 8 }}>Sources</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {validSources.map((src: Source, i: number) => (
            <a key={i} href={src.url} target="_blank" rel="noopener noreferrer"
              className="cite-chip" style={{ width: "fit-content" }}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1.5 5h7M6 2.5L8.5 5 6 7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {src.name}
            </a>
          ))}
        </div>
      </div>
    )
  }

  function KnowledgePanel({ panel }: { panel: any }) {
    return (
      <div className="card" style={{
        background: "rgba(59,130,246,0.03)",
        border: "1px solid rgba(59,130,246,0.15)",
        padding: "12px 14px",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <p className="label" style={{ color: "var(--accent)" }}>Knowledge Panel</p>
          <a href={panel.url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none", opacity: 0.8 }}>
            {panel.title} ↗
          </a>
        </div>
        <p style={{
          fontSize: 12, color: "var(--text-2)", lineHeight: 1.7,
          display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden"
        }}>
          {panel.snippet}
        </p>
      </div>
    )
  }

  function MiniScore({ label, value, color }: { label: string; value: string; color: string }) {
    return (
      <div className="card" style={{ padding: "10px 12px", textAlign: "center" }}>
        <p className="label" style={{ marginBottom: 4 }}>{label}</p>
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 18, fontWeight: 500, color }}>{value}</p>
      </div>
    )
  }

  function Tag({ label, color }: { label: string; color: string }) {
    return (
      <span style={{
        fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
        textTransform: "uppercase", fontFamily: "'DM Mono', monospace",
        color, padding: "2px 8px", borderRadius: 4,
        background: `${color}14`, border: `1px solid ${color}33`,
      }}>
        {label}
      </span>
    )
  }

  // ── Live Status Panel ───────────────────────────────────────────────────────
  function LiveStatus() {
    if (!loading || !statusMsg) return null
    return (
      <div className="bg-surface-container-low border border-outline-variant/10 rounded-sm mb-2 p-3 flex flex-col gap-2">
        {/* Previous steps (dimmed) */}
        {statusHistory.slice(0, -1).map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="6" r="5" stroke="#10b981" strokeWidth="1.2" />
              <path d="M3.5 6l1.8 1.8L8.5 4.5" stroke="#10b981" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <span className="text-[11px] text-[#919191]">{s}</span>
          </div>
        ))}
        {/* Current step (animated) */}
        <div className="flex items-center gap-2">
          <span className="anim-spin inline-block shrink-0 w-2.5 h-2.5 rounded-full border-[1.5px] border-outline-variant/30 border-t-[#ffffff]" />
          <span className="text-[12px] text-[#ffffff] font-medium">{statusMsg}</span>
        </div>
      </div>
    )
  }

  const modeColor = mode === "firewall" ? "var(--accent)" : mode === "compare" ? "var(--purple)" : "var(--text-2)"

  return (
    <div className="flex flex-col h-screen overflow-hidden relative font-headline bg-background text-on-surface w-full" style={{ cursor: 'aùto' }}>
      {/* Cursor */}

      {/* Noise Overlay */}
      <div className="noise-overlay" />
      {/* Ambient Glow */}
      <div className="ambient-glow" />

      {/* Header */}
      <header className="h-16 px-6 md:px-12 flex items-center justify-between sticky top-0 z-40 relative" style={{ background: 'rgba(5,6,8,0.92)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="flex items-center gap-6 h-full">
          <button
            id="open-sidebar-btn"
            onClick={onToggleSidebar}
            className="hidden p-2 text-white/30 hover:text-white hover:bg-white/5 rounded-md transition-all min-h-[44px] min-w-[44px] items-center justify-center"
            aria-label="Toggle Menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 12h18M3 6h18M3 18h18" /></svg>
          </button>
          <nav className="flex gap-6 h-full items-center">
            <button
              onClick={() => { setModel("gpt4"); setMode("chat") }}
              className={`relative h-full flex items-center text-xs font-bold tracking-[0.1em] uppercase transition-colors ${model === 'gpt4' && mode !== 'compare' && mode !== 'firewall' ? 'text-white' : 'text-white/40 hover:text-white'
                }`}
            >
              GPT-4
              {model === 'gpt4' && mode !== 'compare' && mode !== 'firewall' && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white" />
              )}
            </button>
            <button
              onClick={() => { setModel("gemini"); setMode("chat") }}
              className={`relative h-full flex items-center text-xs font-bold tracking-[0.1em] uppercase transition-colors ${model === 'gemini' && mode !== 'compare' && mode !== 'firewall' ? 'text-white' : 'text-white/40 hover:text-white'
                }`}
            >
              Groq
              {model === 'gemini' && mode !== 'compare' && mode !== 'firewall' && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white" />
              )}
            </button>
          </nav>
        </div>
        {/* System Active indicator */}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500" style={{ boxShadow: '0 0 10px rgba(16,185,129,0.5)' }} />
          <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500/80">System Active</span>
        </div>
      </header>

      {/* Central Content Canvas */}
      <section className="flex-1 overflow-y-auto px-4 md:px-12 py-8 md:py-16 flex flex-col items-center custom-scroll w-full">
        {messages.length === 0 ? (
          <div className="w-full flex flex-col items-center justify-center" style={{ position: 'relative', zIndex: 1, minHeight: '70vh' }}>
            <div className="mesh-background" />
            <div className="max-w-4xl w-full flex flex-col items-center">
              <div className="mb-4">
                <h2 className="typewriter font-cabinet text-5xl md:text-6xl text-white tracking-tighter" style={{ fontWeight: 900 }}>Refine your Intelligence</h2>
              </div>
              <p className="text-white/40 text-lg mb-16 stagger-in" style={{ animationDelay: '0.1s' }}>AI answers, human-grade verification.</p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
                {/* Card 1 — Quick Answer */}
                <div onClick={() => setMode("chat")} className="shimmer-card p-8 rounded-xl group stagger-in cursor-pointer" style={{ animationDelay: '0.2s' }}>
                  <div className={`w-10 h-10 mb-6 flex items-center justify-center rounded-lg border transition-colors ${mode === 'chat'
                    ? 'bg-emerald-500/10 border-emerald-500/50'
                    : 'bg-white/5 border-white/10 group-hover:border-emerald-500/50'
                    }`}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={`transition-colors ${mode === 'chat' ? 'text-emerald-400' : 'text-white/60 group-hover:text-emerald-400'}`}><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  </div>
                  <h3 className="font-bold text-white mb-3 text-lg">Quick Answer</h3>
                  <p className="text-sm text-white/50 leading-relaxed">Instant responses for rapid verification and factual lookups. Engineered for speed without compromising core precision.</p>
                </div>

                {/* Card 2 — Verified Research */}
                <div onClick={() => setMode("firewall")} className="shimmer-card p-8 rounded-xl group stagger-in cursor-pointer" style={{ animationDelay: '0.3s' }}>
                  <div className="w-10 h-10 mb-6 flex items-center justify-center bg-emerald-500/10 rounded-lg border border-emerald-500/30 group-hover:bg-emerald-500/20 transition-all" style={{ boxShadow: '0 0 15px rgba(16,185,129,0.1)' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-emerald-400"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                  </div>
                  <h3 className="font-bold text-white mb-3 text-lg">Verified Research</h3>
                  <p className="text-sm text-white/50 leading-relaxed">Deep-dive analysis with cited sources and cross-referenced datasets for high-stakes decision making.</p>
                  <div className="mt-4 flex gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">ACTIVE ENGINE</span>
                  </div>
                </div>

                {/* Card 3 — Model Comparison */}
                <div onClick={() => setMode("compare")} className="shimmer-card p-8 rounded-xl group stagger-in cursor-pointer" style={{ animationDelay: '0.4s' }}>
                  <div className={`w-10 h-10 mb-6 flex items-center justify-center rounded-lg border transition-colors ${mode === 'compare'
                    ? 'bg-indigo-500/10 border-indigo-500/50'
                    : 'bg-white/5 border-white/10 group-hover:border-indigo-500/50'
                    }`}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={`transition-colors ${mode === 'compare' ? 'text-indigo-400' : 'text-white/60 group-hover:text-indigo-400'}`}><path d="M12 3v1m0 16v1M3 12h1m16 0h1M5.636 5.636l.707.707M17.657 17.657l.707.707M5.636 18.364l.707-.707M17.657 6.343l.707-.707" /></svg>
                  </div>
                  <h3 className="font-bold text-white mb-3 text-lg">Model Comparison</h3>
                  <p className="text-sm text-white/50 leading-relaxed">Direct parallel analysis between GPT-4 and Groq. Identify delta points in logic and output consistency.</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-4xl mx-auto flex flex-col space-y-12">
            {messages.map((msg, i) => (
              <div key={i} className="fade-up" style={{ animationDelay: `${i * 0.05}s` }}>

                {/* ── USER BUBBLE ── */}
                {msg.role === "user" && (
                  <div className="flex justify-end">
                    <div className="max-w-[80%] glass-card p-5 rounded-2xl rounded-tr-none shadow-xl">
                      <p className="text-[15px] leading-relaxed text-white/90" style={{ wordBreak: 'break-word' }}>{msg.question}</p>
                      <div className="mt-3 flex justify-end">
                        <span className="text-[9px] uppercase tracking-widest text-white/20 font-bold">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          {msg.intent ? ` · ${msg.intent}` : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── CHAT MODE RESPONSE ── */}
                {msg.role === "assistant" && msg.mode === "chat" && (
                  <div className="space-y-4 fade-up" style={{ animationDelay: '0.1s' }}>
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                        {msg.model_used === 'gemini' ? 'Groq' : 'GPT-4'} · Quick Answer
                      </span>
                    </div>
                    <div className="glass-card p-6 rounded-2xl shadow-xl">
                      <p className="text-sm leading-relaxed text-white/80 whitespace-pre-wrap" style={{ wordBreak: 'break-word' }}>
                        {msg.model_used === 'gemini' ? msg.gemini_raw_answer : msg.gpt_raw_answer}
                      </p>
                    </div>
                  </div>
                )}

                {/* ── FIREWALL MODE RESPONSE ── */}
                {msg.role === "assistant" && msg.mode === "firewall" && (
                  <div className="space-y-6 fade-up" style={{ animationDelay: '0.2s' }}>

                    {msg.status === "SKIPPED" ? (
                      /* Conversational skip */
                      <div className="glass-card p-6 rounded-2xl space-y-4">
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
                          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#6366f1' }}>Conversational query — RAG skipped</span>
                        </div>
                        <p className="text-sm text-white/70 leading-relaxed" style={{ wordBreak: 'break-word' }}>
                          {msg.model_used === 'gemini' ? msg.gemini_raw_answer : msg.gpt_raw_answer}
                        </p>
                        <div className="flex gap-2">
                          <span className="text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.3)' }}>
                            Intent: {msg.intent || 'conversational'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Status badges */}
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${msg.status === 'VERIFIED' || msg.status === 'PASSED'
                            ? 'bg-emerald-500/10 border-emerald-500/30 pulse-emerald'
                            : 'bg-red-500/10 border-red-500/30 pulse-crimson'
                            }`}>
                            {msg.status === 'VERIFIED' || msg.status === 'PASSED'
                              ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22,4 12,14.01 9,11.01" /></svg>
                              : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                            }
                            <span className={`text-[10px] font-bold uppercase tracking-widest ${msg.status === 'VERIFIED' || msg.status === 'PASSED' ? 'text-emerald-400' : 'text-red-400'
                              }`}>{msg.status || 'Analyzed'}</span>
                          </div>
                          {msg.intent && (
                            <div className="px-3 py-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                              <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Intent: {msg.intent}</span>
                            </div>
                          )}
                        </div>

                        {/* Main analysis glass card */}
                        <div className="glass-card p-8 rounded-3xl space-y-8 shadow-2xl">

                          {/* Risk Bar */}
                          {msg.hallucination_score != null && (
                            <div className="space-y-3">
                              <div className="flex justify-between items-end">
                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">Hallucination Risk</p>
                                <span className="font-mono text-lg font-bold" style={{
                                  color: (msg.hallucination_score ?? 0) < 0.15 ? '#10b981' : (msg.hallucination_score ?? 0) < 0.5 ? '#f59e0b' : '#ef4444'
                                }}>
                                  {(msg.hallucination_score ?? 0) < 0.15 ? 'Factual' : 'Risk'} {Number(((msg.hallucination_score ?? 0) * 100).toFixed(1))}%
                                </span>
                              </div>
                              <div className="risk-bar-container h-1.5 w-full rounded-full overflow-hidden">
                                <RiskBar score={msg.hallucination_score ?? 0} />
                              </div>
                              <div className="flex justify-between text-[8px] uppercase tracking-widest font-bold text-white/10">
                                <span>Factual (0%)</span><span>Hallucinated (100%)</span>
                              </div>
                              <p className="text-[9px] text-white/20 italic text-center">Risk score based on pattern similarity — not a guarantee of factual accuracy</p>
                            </div>
                          )}

                          {/* Content sections */}
                          <div className="grid grid-cols-1 gap-5">
                            {/* GPT-4 Raw Output */}
                            <div className="space-y-2">
                              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">
                                {msg.model_used === 'gemini' ? 'Groq' : 'GPT-4'} Raw Output
                              </p>
                              <div className="p-5 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <p className="text-sm leading-relaxed text-white/70 italic" style={{ wordBreak: 'break-word' }}>
                                  {msg.model_used === 'gemini' ? msg.gemini_raw_answer : msg.gpt_raw_answer}
                                </p>
                              </div>
                            </div>

                            {/* Groq/GPT Verification */}
                            {msg.gpt_verified && msg.gpt_reasoning && (
                              <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">
                                    {msg.model_used === 'gemini' ? 'GPT-4' : 'Groq'} Verification Engine
                                  </p>
                                  <span className={`text-[9px] px-2 py-0.5 rounded uppercase font-bold tracking-widest border ${msg.gpt_verdict === 'FACTUAL'
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                    : 'bg-red-500/10 text-red-400 border-red-500/20'
                                    }`}>{msg.gpt_verdict || 'Analyzed'}</span>
                                </div>
                                <div className="p-5 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                  <p className="text-sm leading-relaxed text-white/70" style={{ wordBreak: 'break-word' }}>{msg.gpt_reasoning}</p>
                                </div>
                              </div>
                            )}

                            {/* RAG Correction */}
                            {msg.corrected_answer && (
                              <div className="space-y-2">
                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">RAG-Grounded Correction</p>
                                <div className="rag-box p-6 rounded-xl">
                                  <p className="text-sm leading-relaxed font-bold text-emerald-100/90" style={{ wordBreak: 'break-word' }}>{msg.corrected_answer}</p>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Sources */}
                          {msg.sources && msg.sources.length > 0 && (
                            <div className="space-y-3 pt-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">Verified Sources</p>
                              <div className="flex flex-wrap gap-2">
                                {msg.sources.map((s, si) => (
                                  <a key={si} href={s.url} target="_blank" rel="noopener noreferrer"
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[11px] text-white/50 hover:text-white"
                                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(16,185,129,0.4)')}
                                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
                                  >
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14,2 14,8 20,8" /></svg>
                                    {s.name}
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* ── COMPARE MODE RESPONSE ── */}
                {msg.role === "assistant" && msg.mode === "compare" && (
                  <div className="space-y-5 fade-up" style={{ animationDelay: '0.15s' }}>
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Model Comparison · GPT-4 vs Groq</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {/* GPT-4 column */}
                      <div className="glass-card p-6 rounded-2xl space-y-4">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">GPT-4</span>
                        </div>
                        <p className="text-sm text-white/70 leading-relaxed min-h-[80px]" style={{ wordBreak: 'break-word' }}>{msg.gpt_raw_answer}</p>
                        <div className="border-t pt-4" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                          <div className="flex justify-between text-[10px] font-bold font-mono mb-2">
                            <span className="text-white/30 uppercase">Risk</span>
                            <span style={{ color: (msg.hallucination_score ?? 0) >= 0.08 ? '#ef4444' : '#10b981' }}>
                              {Number(((msg.hallucination_score ?? 0) * 100).toFixed(1))}%
                            </span>
                          </div>
                          <div className="h-1 rounded-full overflow-hidden risk-bar-container">
                            <div className="h-full rounded-full risk-bar-fill" style={{
                              width: `${Math.min((msg.hallucination_score ?? 0) * 100, 100)}%`,
                              background: (msg.hallucination_score ?? 0) >= 0.08 ? '#ef4444' : '#10b981',
                              transition: 'width 1.4s cubic-bezier(0.65,0,0.35,1)'
                            }} />
                          </div>
                        </div>
                      </div>
                      {/* Groq column */}
                      <div className="glass-card p-6 rounded-2xl space-y-4">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-white/60" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Groq</span>
                        </div>
                        <p className="text-sm text-white/70 leading-relaxed min-h-[80px]" style={{ wordBreak: 'break-word' }}>{msg.gemini_raw_answer}</p>
                        <div className="border-t pt-4" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                          <div className="flex justify-between text-[10px] font-bold font-mono mb-2">
                            <span className="text-white/30 uppercase">Risk</span>
                            <span style={{ color: (msg.gemini_score ?? 0) >= 0.08 ? '#ef4444' : '#10b981' }}>
                              {Number(((msg.gemini_score ?? 0) * 100).toFixed(1))}%
                            </span>
                          </div>
                          <div className="h-1 rounded-full overflow-hidden risk-bar-container">
                            <div className="h-full rounded-full risk-bar-fill" style={{
                              width: `${Math.min((msg.gemini_score ?? 0) * 100, 100)}%`,
                              background: (msg.gemini_score ?? 0) >= 0.08 ? '#ef4444' : '#10b981',
                              transition: 'width 1.4s cubic-bezier(0.65,0,0.35,1)'
                            }} />
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Winner card */}
                    {msg.winner && (
                      <div className="glass-card p-5 rounded-2xl flex items-center gap-3">
                        <span className="text-lg">🏆</span>
                        <div>
                          <p className="text-sm font-bold text-white">
                            Winner: {msg.winner === 'gpt4' ? 'GPT-4' : msg.winner === 'groq' ? 'Groq' : 'Tie'}
                          </p>
                          <p className="text-xs text-white/40 mt-0.5">{msg.winner_reason}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Loading state */}
            {loading && (
              <div className="fade-up space-y-4" style={{ animationDelay: '0.1s' }}>
                <LiveStatus />
                {!statusMsg && (
                  <div className="glass-card p-5 rounded-2xl flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full border-2 border-white/60 border-t-transparent animate-spin" />
                    <span className="text-sm text-white/60 font-medium">Analysis in progress...</span>
                  </div>
                )}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="p-4 rounded-xl text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>
                {error}
              </div>
            )}
            <div ref={bottomRef} className="h-40" />
          </div>
        )}
      </section>

      {/* Input Area (Fixed Bottom) */}
      <footer className="p-6 md:p-8 flex flex-col items-center gap-4 fixed bottom-0 right-0 left-0 md:left-60 z-50 pointer-events-none">
        <div className="max-w-3xl w-full pointer-events-auto">
          <div className="input-focus-glow bg-[#0D0E12] border border-white/10 rounded-xl overflow-hidden shadow-2xl transition-all duration-300">
            <div className="flex items-center px-4 py-2">
              <input
                ref={inputRef}
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={handleKey}
                className="flex-1 bg-transparent border-none focus:ring-0 text-white text-sm placeholder:text-white/20 py-4 px-2 outline-none"
                placeholder="Analyze a complex dataset or verify a claim..."
                type="text"
              />
              <div className="flex items-center gap-2">
                <button className="p-2 text-white/30 hover:text-white transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center">
                  {/* Paperclip icon */}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>
                </button>
                <button
                  id="send-btn"
                  onClick={handleSubmit}
                  disabled={loading || !question.trim()}
                  className="w-10 h-10 bg-white hover:bg-emerald-400 text-black rounded-lg flex items-center justify-center transition-all btn-press shadow-lg disabled:opacity-50"
                >
                  {/* Send-horizontal icon */}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" /></svg>
                </button>
              </div>
            </div>
          </div>
          <p className="text-[10px] font-bold text-white/20 uppercase tracking-[0.4em] text-center mt-3 shimmer-text">VERIFYAI CAN MAKE MISTAKES. VERIFY CRITICAL INFORMATION.</p>
        </div>
      </footer>
      <style jsx>{`
        .custom-scroll::-webkit-scrollbar { width: 4px; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #353534; border-radius: 4px; }
      `}</style>
    </div>
  )
}