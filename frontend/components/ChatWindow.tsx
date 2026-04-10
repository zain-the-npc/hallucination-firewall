// ChatWindow.tsx
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
  badge?: string
  intent?: string
  timestamp: string
}

interface Props {
  sessionId: string | null
  onSessionCreated: (id: string) => void
  userId: string
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

// ── SSE stream helper ─────────────────────────────────────────────────────────
async function askFirewallStream(
  question: string,
  mode: string,
  model: string,
  messages: any[],
  onStatus: (msg: string) => void
): Promise<any> {
  const response = await fetch("http://localhost:8000/api/chat/stream", {
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
    buffer = lines.pop() || ""
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue
      try {
        const parsed = JSON.parse(line.slice(6))
        if (parsed.type === "status") onStatus(parsed.message)
        else if (parsed.type === "result") result = parsed.data
        else if (parsed.type === "error") throw new Error(parsed.message)
      } catch (e: any) {
        if (e.message && !e.message.includes("JSON")) throw e
      }
    }
  }

  if (buffer.startsWith("data: ")) {
    try {
      const parsed = JSON.parse(buffer.slice(6))
      if (parsed.type === "result") result = parsed.data
    } catch { }
  }

  if (!result) throw new Error("No result received from stream")
  return result
}

async function askFirewallSync(question: string, mode: string, model: string, messages: any[]): Promise<any> {
  const response = await fetch("http://localhost:8000/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, mode, model, messages }),
  })
  if (!response.ok) throw new Error(`Backend error: ${response.status}`)
  return response.json()
}


export default function ChatWindow({ sessionId, onSessionCreated, userId }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [question, setQuestion] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>("chat")
  const [model, setModel] = useState<Model>("gpt4")
  const [statusMsg, setStatusMsg] = useState<string>("")
  const [statusHistory, setStatusHistory] = useState<string[]>([])
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
        const content = m.role === "user"
          ? m.question || ""
          : m.corrected_answer || (m.model_used === "gemini" ? m.gemini_raw_answer : m.gpt_raw_answer) || m.gpt_raw_answer || m.gemini_raw_answer || ""
        return { role: m.role, content }
      })

      let data: any
      try {
        data = await askFirewallStream(q, mode, selectedModel, historyPayload, (msg) => {
          setStatusMsg(msg)
          setStatusHistory(prev => [...prev, msg])
        })
      } catch (streamErr) {
        console.warn("Stream failed, falling back to sync:", streamErr)
        data = await askFirewallSync(q, mode, selectedModel, historyPayload)
      }

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
        badge: data.badge,
        intent: data.intent,
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
    } catch (err: any) {
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

  // ── Sub-components ──────────────────────────────────────────────────────────

  function Sources({ sources }: { sources: any[] }) {
    if (!sources || sources.length === 0) return null;
    return (
      <div className="sources-section">
        <p className="label" style={{ marginBottom: 8 }}>Sources Checked</p>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {sources.map((src: any, i: number) => {
            const icon = src.provider === "Google" ? "🔍" : src.provider === "Wikipedia" ? "📖" : "📰";
            const providerName = src.provider === "Google" ? "Google Search" : src.provider;
            if (!src.found) {
              return (
                <div key={i} className="source-row" style={{ color: "var(--text-3)" }}>
                  <span>{icon}</span> {providerName} — No results
                </div>
              );
            }
            return (
              <div key={i} className="source-row">
                <span>{icon}</span>
                <span style={{ color: "var(--text-2)" }}>{providerName}</span>
                <span style={{ color: "var(--text-3)" }}>—</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{src.name}</span>
                <a href={src.url || "#"} target="_blank" rel="noopener noreferrer" className="source-link">
                  ↗ link
                </a>
              </div>
            );
          })}
        </div>
      </div>
    )
  }

  function KnowledgePanel({ panel }: { panel: any }) {
    return (
      <div style={{
        background: "rgba(99,102,241,0.06)",
        border: "1px solid rgba(99,102,241,0.15)",
        borderRadius: "var(--radius-sm)",
        padding: "12px 14px",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <p className="label" style={{ color: "var(--accent)" }}>Knowledge Panel</p>
          <a href={panel.url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none" }}>
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
      <div className="stat-card">
        <p className="stat-label">{label}</p>
        <div className="stat-value" style={{ color }}>{value}</div>
      </div>
    )
  }

  function Tag({ label, color }: { label: string; color: string }) {
    return (
      <span style={{
        fontSize: 10, fontWeight: 600, letterSpacing: "0.5px",
        textTransform: "uppercase",
        color, padding: "3px 9px", borderRadius: 99,
        background: `${color}18`, border: `1px solid ${color}33`,
      }}>
        {label}
      </span>
    )
  }

  function GroqUnavailable() {
    return (
      <div style={{
        padding: "10px 14px",
        background: "rgba(245,158,11,0.06)",
        border: "1px solid rgba(245,158,11,0.2)",
        borderRadius: 8,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 14 }}>⚠️</span>
        <p style={{ fontSize: 12, color: "var(--amber)", lineHeight: 1.5 }}>
          Groq API is temporarily unavailable (quota or key issue). GPT-4 result is still valid above.
        </p>
      </div>
    )
  }

  // ── Live Status Panel ────────────────────────────────────────────────────────
  function LiveStatus() {
    if (!loading || (!statusMsg && statusHistory.length === 0)) return null
    return (
      <div style={{
        display: "flex", flexDirection: "column", gap: 6,
        padding: "12px 14px",
        background: "var(--bg-3)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)", marginBottom: 8,
      }}>
        {statusHistory.slice(0, -1).map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="6" r="5" stroke="var(--green)" strokeWidth="1.2" />
              <path d="M3.5 6l1.8 1.8L8.5 4.5" stroke="var(--green)" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>{s}</span>
          </div>
        ))}
        {statusMsg && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="anim-spin" style={{
              width: 10, height: 10, borderRadius: "50%",
              border: "1.5px solid var(--border)",
              borderTopColor: "var(--accent)", display: "inline-block", flexShrink: 0,
            }} />
            <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 500 }}>{statusMsg}</span>
          </div>
        )}
      </div>
    )
  }

  const modeColor = mode === "firewall" ? "var(--accent)" : mode === "compare" ? "var(--purple)" : "var(--text-2)"

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>

      {/* Top tab navigation */}
      <div className="tab-bar">
        {MODES.map(m => (
          <button key={m.id} onClick={() => setMode(m.id)}
            className={`tab ${mode === m.id ? "active" : ""}`}
            title={m.desc}>
            {m.label}
          </button>
        ))}
        <div style={{ width: 1, height: 24, background: "var(--border)", margin: "0 8px" }} />
        {mode !== "compare" && (
          (["gpt4", "gemini"] as Model[]).map(m => (
            <button key={m} onClick={() => setModel(m)}
              className={`tab ${model === m ? "active" : ""}`}>
              {m === "gpt4" ? "GPT-4" : "Groq"}
            </button>
          ))
        )}
        <div style={{ flex: 1 }} />
        <Link href="/dashboard" style={{ textDecoration: "none" }}>
          <button className="tab">Analytics →</button>
        </Link>
      </div>

      {/* Mode info bar */}
      {mode !== "chat" && (
        <div style={{
          padding: "6px 20px",
          background: "var(--bg-2)",
          borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--accent)", display: "inline-block", flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>
            {mode === "firewall"
              ? `Verified Research · DistilBERT → GPT-4 verification → RAG · model: ${model === "gpt4" ? "GPT-4" : "Groq"}`
              : "Model Comparison · GPT-4 vs Groq · both scored by DistilBERT"}
          </span>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 24px 0" }}>

        {messages.length === 0 && (
          <div className="anim-in" style={{ maxWidth: 640, margin: "0 auto", paddingTop: "6vh" }}>
            {/* Logo + wordmark */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: "var(--accent)", display: "flex",
                alignItems: "center", justifyContent: "center",
              }}>
                <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                  <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
                  <circle cx="8" cy="8" r="2" fill="#fff" />
                </svg>
              </div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-1)" }}>VerifyAI</h1>
            </div>

            {/* Serif tagline */}
            <p style={{
              fontFamily: "var(--font-serif)", fontStyle: "italic",
              fontSize: 28, color: "var(--text-1)", lineHeight: 1.3, marginBottom: 10,
            }}>
              AI answers you can actually trust.
            </p>
            <p style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 36 }}>
              Powered by DistilBERT · GPT-4 · RAG Pipeline
            </p>

            {/* Large feature cards */}
            <div style={{ display: "flex", gap: 14, marginBottom: 28 }}>
              {[
                { id: "chat"     as Mode, icon: "⚡", label: "Quick Answer",     desc: "Fast responses, no verification" },
                { id: "firewall" as Mode, icon: "🔬", label: "Verified Research", desc: "Full fact-check with RAG sources" },
                { id: "compare"  as Mode, icon: "⚖️", label: "Compare Models",   desc: "GPT-4 vs Groq, side by side" },
              ].map(m => (
                <div key={m.id} onClick={() => setMode(m.id)}
                  className="feature-card"
                  style={{
                    borderColor: mode === m.id ? "var(--accent)" : undefined,
                    background: mode === m.id ? "var(--bg-4)" : undefined,
                  }}>
                  <span className="feature-card-icon">{m.icon}</span>
                  <p className="feature-card-title">{m.label}</p>
                  <p className="feature-card-desc">{m.desc}</p>
                </div>
              ))}
            </div>

            {/* Chip row */}
            <div style={{ marginBottom: 8 }}>
              <p className="label" style={{ marginBottom: 10 }}>Try these examples</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {EXAMPLES.map(q => (
                  <button key={q}
                    onClick={() => { setMode("firewall"); setQuestion(q); inputRef.current?.focus() }}
                    className="chip">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          {messages.map((msg, i) => (
            <div key={i} className="anim-up" style={{ marginBottom: 20 }}>

              {/* User bubble */}
              {msg.role === "user" && (
                <div className="user-message">
                  {msg.question}
                </div>
              )}

              {/* Chat mode */}
              {msg.role === "assistant" && msg.mode === "chat" && (
                <div className="answer-card" style={{ maxWidth: "85%" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: "50%",
                      background: msg.model_used === "gemini" ? "var(--accent)" : "var(--green)",
                      display: "inline-block"
                    }} />
                    <span className="label">{msg.model_used === "gemini" ? "Groq" : "GPT-4"}</span>
                  </div>
                  <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.7 }}>
                    {msg.model_used === "gemini" ? msg.gemini_raw_answer : msg.gpt_raw_answer}
                  </p>
                  <p style={{ fontSize: 10, color: "var(--text-3)", marginTop: 8 }}>
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              )}

              {/* Firewall mode */}
              {msg.role === "assistant" && msg.mode === "firewall" && (
                <div className="answer-card">

                  <div className="pipeline-banner">
                    DistilBERT score &gt;0.65 <span>→</span> RAG auto-fires <span>|</span> 0.45–0.65 <span>→</span> GPT-4 second opinion <span>|</span> Sources always checked
                  </div>

                  {/* Groq unavailable */}
                  {msg.status === "UNAVAILABLE" ? (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <FirewallBadge status="UNAVAILABLE" />
                        <span style={{ fontSize: 11, color: "var(--text-3)" }}>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <GroqUnavailable />
                    </>
                  ) : msg.badge === "conversational_query" ? (
                    <div style={{ maxWidth: "85%" }}>
                      <div style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 8 }}>
                        ℹ️ Conversational query — verification skipped
                      </div>
                      <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.7 }}>
                        {msg.model_used === "gemini" ? msg.gemini_raw_answer : msg.gpt_raw_answer}
                      </p>
                    </div>
                  ) : msg.status === "SKIPPED" ? (
                    <div style={{ maxWidth: "85%" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <span style={{
                          width: 6, height: 6, borderRadius: "50%",
                          background: msg.model_used === "gemini" ? "var(--accent)" : "var(--green)",
                          display: "inline-block"
                        }} />
                        <span className="label">{msg.model_used === "gemini" ? "Groq" : "GPT-4"}</span>
                        <Tag label="Conversational" color="var(--text-3)" />
                      </div>
                      <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.7 }}>
                        {msg.model_used === "gemini" ? msg.gemini_raw_answer : msg.gpt_raw_answer}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <FirewallBadge status={msg.status!} />
                        <span style={{ fontSize: 11, color: "var(--text-3)" }}>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                      </div>

                      {/* ── HALLUCINATION RISK METER ── */}
                      <ConfidenceMeter score={msg.hallucination_score ?? 0} label={msg.confidence_label ?? ""} />

                      {/* Raw answer */}
                      <div className="answer-card" style={{ padding: "14px", marginTop: "12px", background: "var(--bg-3)" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                          <p className="label">{msg.model_used === "gemini" ? "Groq" : "GPT-4"} · Raw Answer</p>
                          {(msg.status === "PASSED" || msg.status === "VERIFIED")
                            ? <span className="badge-verified">Verified</span>
                            : <Tag label="Unverified" color="var(--amber)" />
                          }
                        </div>
                        <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.7 }}>
                          {msg.model_used === "gemini" ? msg.gemini_raw_answer : msg.gpt_raw_answer}
                        </p>
                      </div>

                      {msg.knowledge_panel && <KnowledgePanel panel={msg.knowledge_panel} />}

                      {/* GPT second opinion */}
                      {msg.gpt_verified && msg.gpt_reasoning && (
                        <div className="card-purple" style={{ padding: "12px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                            <p className="label" style={{ color: "var(--purple)" }}>Second Opinion · GPT-4</p>
                            <Tag label={msg.gpt_verdict || ""} color={msg.gpt_verdict === "FACTUAL" ? "var(--green)" : "var(--red)"} />
                          </div>
                          <p style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.7 }}>{msg.gpt_reasoning}</p>
                        </div>
                      )}

                      {/* ── RAG CORRECTED ANSWER ── */}
                      {msg.corrected_answer && (
                        <div className="card-green" style={{ padding: "14px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span className="anim-pulse" style={{
                                width: 6, height: 6, borderRadius: "50%",
                                background: "var(--green)", display: "inline-block",
                              }} />
                              <p className="label" style={{ color: "var(--green)" }}>Corrected Answer · RAG-Grounded</p>
                            </div>
                            {msg.rag_provider && <Tag label={`via ${msg.rag_provider}`} color="var(--text-2)" />}
                          </div>
                          <p style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.7 }}>{msg.corrected_answer}</p>
                        </div>
                      )}

                      <Sources sources={msg.sources ?? []} />

                      {/* ── SCORE GRID ── */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                        <MiniScore
                          label="Hallucination"
                          value={`${Math.round((msg.hallucination_score ?? 0) * 100)}%`}
                          color={
                            (msg.hallucination_score ?? 0) >= 0.6 ? "var(--red)" :
                              (msg.hallucination_score ?? 0) >= 0.45 ? "var(--amber)" : "var(--green)"
                          }
                        />
                        <MiniScore
                          label="Factual"
                          value={`${Math.round((msg.factual_score ?? 0) * 100)}%`}
                          color={(msg.factual_score ?? 0) >= 0.7 ? "var(--green)" : "var(--amber)"}
                        />
                        <MiniScore
                          label="RAG Used"
                          value={msg.rag_used ? "Yes" : "No"}
                          color={msg.rag_used ? "var(--accent)" : "var(--text-3)"}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Compare mode */}
              {msg.role === "assistant" && msg.mode === "compare" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Tag label="Model Comparison" color="var(--purple)" />
                    <span style={{ fontSize: 11, color: "var(--text-3)" }}>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {/* GPT-4 card */}
                    <div className="response-card" style={{ padding: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", display: "inline-block" }} />
                          <p className="label">GPT-4</p>
                        </div>
                        <FirewallBadge status={msg.status || "UNKNOWN"} />
                      </div>
                      <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.7, marginBottom: 12 }}>
                        {msg.gpt_raw_answer}
                      </p>
                      {/* ── GPT risk score bar ── */}
                      {msg.hallucination_score != null && (
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ fontSize: 10, color: "var(--text-3)" }}>Hallucination risk</span>
                            <span style={{
                              fontSize: 11, fontFamily: "'DM Mono', monospace", fontWeight: 600,
                              color: msg.hallucination_score >= 0.6 ? "var(--red)" :
                                msg.hallucination_score >= 0.45 ? "var(--amber)" : "var(--green)",
                            }}>
                              {Math.round(msg.hallucination_score * 100)}%
                            </span>
                          </div>
                          <div className="progress-track">
                            <div className="progress-fill" style={{
                              width: `${Math.round(msg.hallucination_score * 100)}%`,
                              background: msg.hallucination_score >= 0.6 ? "var(--red)" :
                                msg.hallucination_score >= 0.45 ? "var(--amber)" : "var(--green)",
                            }} />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Groq card */}
                    <div className="response-card" style={{ padding: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />
                          <p className="label">Groq</p>
                        </div>
                        <FirewallBadge status={msg.gemini_status || "UNKNOWN"} />
                      </div>

                      {/* Show unavailable warning if Groq failed */}
                      {msg.gemini_status === "UNAVAILABLE" ? (
                        <GroqUnavailable />
                      ) : (
                        <>
                          <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.7, marginBottom: 12 }}>
                            {msg.gemini_raw_answer}
                          </p>
                          {/* ── Groq risk score bar ── */}
                          {msg.gemini_score != null && (
                            <div>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                <span style={{ fontSize: 10, color: "var(--text-3)" }}>Hallucination risk</span>
                                <span style={{
                                  fontSize: 11, fontFamily: "'DM Mono', monospace", fontWeight: 600,
                                  color: msg.gemini_score >= 0.6 ? "var(--red)" :
                                    msg.gemini_score >= 0.45 ? "var(--amber)" : "var(--green)",
                                }}>
                                  {Math.round(msg.gemini_score * 100)}%
                                </span>
                              </div>
                              <div className="progress-track">
                                <div className="progress-fill" style={{
                                  width: `${Math.round(msg.gemini_score * 100)}%`,
                                  background: msg.gemini_score >= 0.6 ? "var(--red)" :
                                    msg.gemini_score >= 0.45 ? "var(--amber)" : "var(--green)",
                                }} />
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Winner banner — only show if both scored */}
                  {msg.hallucination_score != null && msg.gemini_score != null && msg.gemini_status !== "UNAVAILABLE" && (
                    <div className="card" style={{
                      padding: "10px 14px", textAlign: "center",
                      borderColor: msg.hallucination_score < msg.gemini_score
                        ? "rgba(34,197,94,0.25)"
                        : msg.gemini_score < msg.hallucination_score
                          ? "rgba(59,130,246,0.25)"
                          : "var(--border)",
                    }}>
                      <span style={{ fontSize: 12, color: "var(--text-2)" }}>
                        {msg.hallucination_score < msg.gemini_score
                          ? "✓ GPT-4 scored more factual on this question"
                          : msg.gemini_score < msg.hallucination_score
                            ? "✓ Groq scored more factual on this question"
                            : "Both models scored equally"}
                      </span>
                    </div>
                  )}

                  {msg.knowledge_panel && <KnowledgePanel panel={msg.knowledge_panel} />}

                  {msg.corrected_answer && (
                    <div className="card-green" style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                        <p className="label" style={{ color: "var(--green)" }}>Grounded Answer</p>
                        {msg.rag_provider && <Tag label={`via ${msg.rag_provider}`} color="var(--text-2)" />}
                      </div>
                      <p style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.7 }}>{msg.corrected_answer}</p>
                    </div>
                  )}

                  <Sources sources={msg.sources ?? []} />
                </div>
              )}
            </div>
          ))}

          {/* Loading state */}
          {loading && (
            <div className="anim-in" style={{ marginBottom: 20 }}>
              <LiveStatus />
              {!statusMsg && (
                <div className="loading-dots" style={{ gap: 6 }}>
                  <div className="thinking-dots"><span /><span /><span /></div>
                  <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                    {mode === "compare" ? "Querying both models…" : mode === "firewall" ? "Running verification pipeline…" : "Thinking…"}
                  </span>
                </div>
              )}
              {mode === "compare" ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {[0, 1].map(i => (
                    <div key={i} className="answer-card" style={{ padding: 14 }}>
                      <div className="skeleton" style={{ height: 12, width: "40%", marginBottom: 12, borderRadius: 4 }} />
                      <div className="skeleton" style={{ height: 10, width: "100%", marginBottom: 6, borderRadius: 4 }} />
                      <div className="skeleton" style={{ height: 10, width: "75%", borderRadius: 4 }} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="answer-card" style={{ padding: 14 }}>
                  <div className="skeleton" style={{ height: 10, width: "80%", marginBottom: 8, borderRadius: 4 }} />
                  <div className="skeleton" style={{ height: 10, width: "60%", borderRadius: 4 }} />
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="card-red anim-up" style={{ padding: "10px 14px", marginBottom: 20 }}>
              <p style={{ fontSize: 12, color: "var(--red)" }}>{error}</p>
            </div>
          )}

          <div ref={bottomRef} style={{ height: 1 }} />
        </div>
      </div>

      {/* Input area */}
      <div className="input-container">
        <div style={{ maxWidth: 680, margin: "0 auto", position: "relative" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              ref={inputRef}
              type="text"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={handleKey}
              placeholder={
                mode === "compare" ? "Ask — GPT-4 and Groq will both answer…" :
                  mode === "firewall" ? "Ask a factual question to verify…" :
                    "Ask anything…"
              }
              className="input-field"
            />
            <button
              onClick={handleSubmit}
              disabled={loading || !question.trim()}
              className="send-btn"
            >
              {loading ? (
                <span className="anim-spin" style={{
                  width: 14, height: 14, borderRadius: "50%",
                  border: "2px solid rgba(0,0,0,0.3)",
                  borderTopColor: "#000", display: "inline-block",
                }} />
              ) : mode === "compare" ? "Compare" : "Send"}
            </button>
          </div>
          <p style={{ fontSize: 10, color: "var(--text-3)", textAlign: "center", marginTop: 8 }}>
            {mode === "firewall"
              ? "DistilBERT → GPT-4 verification → Serper Google + Wikipedia + News (parallel)"
              : mode === "compare"
                ? "Both models scored independently by DistilBERT (F1 0.962)"
                : `${model === "gemini" ? "Groq" : "GPT-4"} · no fact-checking · switch to Verified Research for verification`}
          </p>
        </div>
      </div>
    </div>
  )
}
