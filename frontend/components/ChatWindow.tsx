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
    <div className="flex flex-col h-screen overflow-hidden relative font-headline bg-background text-on-surface w-full">
      {/* TopNavBar Shell */}
      <header className="flex items-center justify-between w-full px-4 md:pl-8 md:pr-8 h-16 sticky top-0 bg-[#131313] z-40">
        <div className="flex items-center gap-2 md:gap-8">
          <button
            onClick={onToggleSidebar}
            className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center text-[#ffffff]"
            aria-label="Toggle Menu"
          >
            <span className="material-symbols-outlined">menu</span>
          </button>
          <div className="flex gap-4 md:gap-8">
            <button onClick={() => { setModel("gpt4"); setMode("chat") }} className={`text-sm font-medium transition-opacity active:opacity-80 min-h-[44px] ${model === 'gpt4' && mode !== 'compare' && mode !== 'firewall' ? 'text-[#ffffff] border-b border-[#ffffff] pb-1' : 'text-[#c6c6c6] hover:text-[#ffffff]'}`}>GPT-4</button>
            <button onClick={() => { setModel("gemini"); setMode("chat") }} className={`text-sm font-medium transition-colors active:opacity-80 min-h-[44px] ${model === 'gemini' && mode !== 'compare' && mode !== 'firewall' ? 'text-[#ffffff] border-b border-[#ffffff] pb-1' : 'text-[#c6c6c6] hover:text-[#ffffff]'}`}>Groq</button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* Profile and Settings buttons entirely removed */}
        </div>
      </header>

      {/* Central Content Canvas */}
      <section className="flex-1 overflow-y-auto px-4 md:px-12 py-8 md:py-16 flex flex-col items-center custom-scroll w-full">
        {messages.length === 0 ? (
          <div className="w-full flex flex-col items-center">
            <div className="w-full max-w-4xl mb-16 text-center">
              <h2 className="text-4xl md:text-5xl font-extrabold tracking-tighter text-on-surface mb-4">Refine your Intelligence</h2>
              <p className="text-lg text-on-surface-variant font-normal">AI answers, human-grade verification.</p>
            </div>

            {/* Core Feature Cards (Bento-inspired Grid) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl">
              <div onClick={() => setMode("chat")} className={`bg-surface-container-low hover:bg-surface-container transition-all duration-300 p-8 flex flex-col group h-full cursor-pointer rounded-sm ${mode === 'chat' ? 'border border-[#ffffff]' : 'border border-outline-variant/10 hover:border-outline-variant/30'}`}>
                <div className="mb-6 text-primary">
                  <span className="material-symbols-outlined text-3xl">bolt</span>
                </div>
                <h3 className="text-xl font-bold text-on-surface mb-3">Quick Answer</h3>
                <p className="text-on-surface-variant text-sm leading-relaxed flex-1">
                  Instant responses for rapid verification and factual lookups. Engineered for speed without compromising core precision.
                </p>
                <div className="mt-6 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  Launch <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </div>
              </div>

              <div onClick={() => setMode("firewall")} className={`bg-surface-container-low hover:bg-surface-container transition-all duration-300 p-8 flex flex-col group h-full cursor-pointer rounded-sm ${mode === 'firewall' ? 'border border-[#ffffff]' : 'border border-outline-variant/10 hover:border-outline-variant/30'}`}>
                <div className="mb-6 text-primary">
                  <span className="material-symbols-outlined text-3xl">fact_check</span>
                </div>
                <h3 className="text-xl font-bold text-on-surface mb-3">Verified Research</h3>
                <p className="text-on-surface-variant text-sm leading-relaxed flex-1">
                  Deep-dive analysis with cited sources and cross-referenced datasets for high-stakes decision making.
                </p>
                <div className="mt-6 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  Launch <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </div>
              </div>

              <div onClick={() => setMode("compare")} className={`bg-surface-container-low hover:bg-surface-container transition-all duration-300 p-8 flex flex-col group h-full cursor-pointer rounded-sm ${mode === 'compare' ? 'border border-[#ffffff]' : 'border border-outline-variant/10 hover:border-outline-variant/30'}`}>
                <div className="mb-6 text-primary">
                  <span className="material-symbols-outlined text-3xl">balance</span>
                </div>
                <h3 className="text-xl font-bold text-on-surface mb-3">Model Comparison</h3>
                <p className="text-on-surface-variant text-sm leading-relaxed flex-1">
                  Direct parallel analysis between GPT-4 and Groq. Identify delta points in logic and output consistency.
                </p>
                <div className="mt-6 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  Launch <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-4xl mx-auto flex flex-col">
            {messages.map((msg, i) => (
              <div key={i} className="mb-10 anim-up">
                {msg.role === "user" && (
                  <div className="flex justify-end">
                    <div className="bg-surface-bright border border-outline-variant/20 rounded-sm px-4 md:px-6 py-4 max-w-[95%] md:max-w-[80%] shadow-lg">
                      <p className="text-sm text-on-surface leading-relaxed break-words word-break break-all min-w-0" style={{ wordBreak: 'break-word' }}>{msg.question}</p>
                    </div>
                  </div>
                )}

                {msg.role === "assistant" && msg.mode === "chat" && (
                  <div className="max-w-full md:max-w-[85%] mt-6">
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`w-2 h-2 rounded-full ${msg.model_used === 'gemini' ? 'bg-[#c6c6c6]' : 'bg-[#ffffff]'}`}></div>
                      <span className="text-xs uppercase tracking-widest font-bold text-on-surface-variant">{msg.model_used === "gemini" ? "Groq" : "GPT-4"}</span>
                    </div>
                    <div className="bg-surface-container-low border border-outline-variant/10 rounded-sm px-6 py-4 shadow-sm">
                      <p className="text-sm text-on-surface-variant leading-relaxed whitespace-pre-wrap">
                        {msg.model_used === "gemini" ? msg.gemini_raw_answer : msg.gpt_raw_answer}
                      </p>
                    </div>
                  </div>
                )}

                {msg.role === "assistant" && msg.mode === "firewall" && (
                  <div className="max-w-full md:max-w-[95%] mt-6 flex flex-col gap-4">
                    {msg.status === "SKIPPED" ? (
                      <div className="bg-surface-container-low border border-outline-variant/10 rounded-sm px-4 md:px-6 py-4 shadow-sm overflow-hidden">
                        <p className="text-sm text-on-surface-variant leading-relaxed break-words" style={{ wordBreak: 'break-word' }}>
                          {msg.model_used === "gemini" ? msg.gemini_raw_answer : msg.gpt_raw_answer}
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-4">
                          <FirewallBadge status={msg.status!} />
                        </div>
                        <ConfidenceMeter score={msg.hallucination_score ?? 0} label={msg.confidence_label ?? ""} />
                        <div className="bg-surface-container-low border border-outline-variant/10 rounded-sm p-4 md:p-6 overflow-hidden">
                          <div className="flex justify-between items-center mb-4">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{msg.model_used === "gemini" ? "Groq" : "GPT-4"} RAW</span>
                            </div>
                            {msg.status !== "PASSED" && msg.status !== "VERIFIED" && (
                              <Tag label="Unverified" color="#f59e0b" />
                            )}
                          </div>
                          <p className="text-sm text-on-surface-variant leading-relaxed break-words" style={{ wordBreak: 'break-word' }}>
                            {msg.model_used === "gemini" ? msg.gemini_raw_answer : msg.gpt_raw_answer}
                          </p>
                        </div>
                        {msg.knowledge_panel && <KnowledgePanel panel={msg.knowledge_panel} />}
                        {msg.gpt_verified && msg.gpt_reasoning && (
                          <div className="bg-surface-container border border-outline-variant/10 rounded-sm p-6">
                            <div className="flex justify-between items-center mb-4">
                              <p className="text-xs font-bold uppercase tracking-widest text-on-surface">{msg.model_used === "gemini" ? "GPT-4" : "GROQ"} VERIFICATION</p>
                              <Tag label={msg.gpt_verdict || ""} color={msg.gpt_verdict === "FACTUAL" ? "#10b981" : "#ef4444"} />
                            </div>
                            <p className="text-sm text-on-surface-variant leading-relaxed">{msg.gpt_reasoning}</p>
                          </div>
                        )}
                        {msg.corrected_answer && (
                          <div className="bg-[#1c2c26] border border-[#2d4d3d] rounded-sm p-4 md:p-6 overflow-hidden">
                            <div className="flex justify-between items-center mb-4">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse"></div>
                                <p className="text-xs font-bold uppercase tracking-widest text-[#10b981]">RAG-GROUNDED CORRECTION</p>
                              </div>
                            </div>
                            <p className="text-sm text-on-surface leading-relaxed">{msg.corrected_answer}</p>
                          </div>
                        )}
                        {/* ── SOURCES: shown whenever present, regardless of correction ── */}
                        {msg.sources && msg.sources.length > 0 && <Sources sources={msg.sources} />}
                        <div className="flex gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider bg-surface-container border border-outline-variant/20 px-3 py-1 rounded-sm text-on-surface-variant">Intent: {msg.intent || "factual"}</span>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {msg.role === "assistant" && msg.mode === "compare" && (
                  <div className="mt-6 flex flex-col gap-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-surface-container border border-outline-variant/10 rounded-sm p-6">
                        <div className="flex justify-between items-center mb-4">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-[#10b981]"></div>
                            <span className="text-xs font-bold uppercase tracking-widest text-on-surface">GPT-4</span>
                          </div>
                        </div>
                        <p className="text-sm text-on-surface-variant leading-relaxed min-h-[100px] mb-6">{msg.gpt_raw_answer}</p>
                        <div className="border-t border-outline-variant/10 pt-4">
                          <div className="flex justify-between text-xs font-bold font-mono mb-2">
                            <span className="text-on-surface-variant uppercase">Risk</span>
                            <span style={{ color: (msg.hallucination_score ?? 0) >= 0.08 ? "#ef4444" : "#10b981" }}>{Number(((msg.hallucination_score ?? 0) * 100).toFixed(1))}%</span>
                          </div>
                          <div className="h-1 bg-surface-variant rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.min((msg.hallucination_score ?? 0) * 100, 100)}%`, background: (msg.hallucination_score ?? 0) >= 0.08 ? "#ef4444" : "#10b981" }}></div>
                          </div>
                        </div>
                      </div>

                      <div className="bg-surface-container border border-outline-variant/10 rounded-sm p-6">
                        <div className="flex justify-between items-center mb-4">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-[#ffffff]"></div>
                            <span className="text-xs font-bold uppercase tracking-widest text-on-surface">Groq</span>
                          </div>
                        </div>
                        <p className="text-sm text-on-surface-variant leading-relaxed min-h-[100px] mb-6">{msg.gemini_raw_answer}</p>
                        <div className="border-t border-outline-variant/10 pt-4">
                          <div className="flex justify-between text-xs font-bold font-mono mb-2">
                            <span className="text-on-surface-variant uppercase">Risk</span>
                            <span style={{ color: (msg.gemini_score ?? 0) >= 0.08 ? "#ef4444" : "#10b981" }}>{Number(((msg.gemini_score ?? 0) * 100).toFixed(1))}%</span>
                          </div>
                          <div className="h-1 bg-surface-variant rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.min((msg.gemini_score ?? 0) * 100, 100)}%`, background: (msg.gemini_score ?? 0) >= 0.08 ? "#ef4444" : "#10b981" }}></div>
                          </div>
                        </div>
                      </div>
                    </div>
                    {msg.winner && (
                      <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #2a2a2a', fontSize: '14px' }}>
                        🏆 <strong>Winner: {msg.winner === 'gpt4' ? 'GPT-4' : msg.winner === 'groq' ? 'Groq' : 'Tie'}</strong> — {msg.winner_reason}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="mb-10 pl-2">
                <LiveStatus />
                {!statusMsg && (
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full border-2 border-[#ffffff] border-t-transparent animate-spin"></div>
                    <span className="text-sm text-[#ffffff] font-bold">Analysis in progress...</span>
                  </div>
                )}
              </div>
            )}
            {error && (
              <div className="bg-[#93000a]/20 border border-[#93000a]/40 text-[#ffb4ab] px-6 py-4 rounded-sm text-sm mb-10">
                {error}
              </div>
            )}
            <div ref={bottomRef} className="h-40" />
          </div>
        )}
      </section>

      {/* Input Area (Fixed Bottom) */}
      <div className="fixed bottom-0 right-0 left-0 md:left-64 px-4 md:px-12 pb-4 md:pb-10 pt-4 md:pt-10 pointer-events-none z-50 bg-[#131313] md:bg-transparent shadow-[0_-20px_20px_-10px_#131313_inset] md:shadow-[0_-50px_40px_-20px_#131313_inset]">
        <div className="max-w-4xl mx-auto relative pointer-events-auto">
          <div className="flex items-center bg-surface-container-lowest border-b border-outline-variant/20 focus-within:border-primary transition-colors px-4 md:px-6 py-2 md:py-4">
            <input
              ref={inputRef}
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={handleKey}
              className="flex-1 bg-transparent border-none focus:ring-0 text-on-surface placeholder:text-on-surface-variant/40 text-sm outline-none w-full min-h-[44px]"
              placeholder={mode === 'firewall' ? "Analyze a complex dataset or verify a claim..." : "Analyze a complex dataset or verify a claim..."}
              type="text"
            />
            <div className="flex items-center gap-2 md:gap-4 ml-2">
              <button className="text-on-surface-variant hover:text-[#ffffff] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center">
                <span className="material-symbols-outlined text-xl">attach_file</span>
              </button>
              <button onClick={handleSubmit} disabled={loading || !question.trim()} className="w-11 h-11 bg-[#ffffff] text-on-primary rounded-sm flex items-center justify-center hover:opacity-90 active:scale-[0.95] transition-all disabled:opacity-50">
                <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>send</span>
              </button>
            </div>
          </div>
          <div className="mt-4 flex justify-center">
            <p className="text-[10px] text-on-surface-variant/40 uppercase tracking-[0.1em] font-medium">VerifyAI can make mistakes. Verify critical information.</p>
          </div>
        </div>
      </div>
      <style jsx>{`
        .custom-scroll::-webkit-scrollbar { width: 4px; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #353534; border-radius: 4px; }
      `}</style>
    </div>
  )
}