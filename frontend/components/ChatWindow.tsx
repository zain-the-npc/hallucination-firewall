// ChatWindow.tsx new
"use client"

import { useEffect, useRef, useState } from "react"
import { createSession, getSession, updateSession, generateTitle } from "../lib/sessions"
import ConfidenceMeter from "./ConfidenceMeter"
import FirewallBadge   from "./FirewallBadge"
import Link            from "next/link"

type Mode  = "chat" | "firewall" | "compare"
type Model = "gpt4" | "gemini"

interface Source { name: string; url: string; snippet: string }

interface Message {
  role:                 "user" | "assistant"
  question?:            string
  gpt_raw_answer?:      string | null
  gemini_raw_answer?:   string | null
  hallucination_score?: number | null
  factual_score?:       number | null
  gemini_score?:        number | null
  confidence_label?:    string | null
  status?:              string
  gemini_status?:       string | null
  corrected_answer?:    string | null
  sources?:             Source[]
  rag_used?:            boolean
  rag_provider?:        string | null
  gpt_verified?:        boolean
  gpt_verdict?:         string | null
  gpt_reasoning?:       string | null
  mode?:                Mode
  model_used?:          string
  knowledge_panel?:     any
  timestamp:            string
}

interface Props {
  sessionId:        string | null
  onSessionCreated: (id: string) => void
  userId:           string
}

const MODES = [
  { id: "chat"     as Mode, label: "Quick Answer",     desc: "Fast AI responses"              },
  { id: "firewall" as Mode, label: "Verified Research", desc: "Full fact-check pipeline"       },
  { id: "compare"  as Mode, label: "Model Comparison",  desc: "GPT-4 vs Gemini, both scored"  },
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
  onStatus: (msg: string) => void
): Promise<any> {
  const response = await fetch("https://verifyai.up.railway.app/api/chat/stream", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ question, mode, model }),
  })

  if (!response.ok) throw new Error(`Backend error: ${response.status}`)
  if (!response.body) throw new Error("No response body")

  const reader  = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer    = ""
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
async function askFirewallSync(question: string, mode: string, model: string): Promise<any> {
  const response = await fetch("https://verifyai.up.railway.app/api/chat", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ question, mode, model }),
  })
  if (!response.ok) throw new Error(`Backend error: ${response.status}`)
  return response.json()
}


export default function ChatWindow({ sessionId, onSessionCreated, userId }: Props) {
  const [messages,      setMessages]      = useState<Message[]>([])
  const [question,      setQuestion]      = useState("")
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [mode,          setMode]          = useState<Mode>("chat")
  const [model,         setModel]         = useState<Model>("gpt4")
  const [statusMsg,     setStatusMsg]     = useState<string>("")   // live status
  const [statusHistory, setStatusHistory] = useState<string[]>([]) // all statuses
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)

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

      const data = await askFirewallStream(q, mode, selectedModel, (msg) => {
        setStatusMsg(msg)
        setStatusHistory(prev => [...prev, msg])
      })

      const aMsg: Message = {
        role:                "assistant",
        gpt_raw_answer:      data.gpt_raw_answer,
        gemini_raw_answer:   data.gemini_raw_answer,
        hallucination_score: data.hallucination_score,
        factual_score:       data.factual_score,
        gemini_score:        data.gemini_score,
        confidence_label:    data.confidence_label,
        status:              data.status,
        gemini_status:       data.gemini_status,
        corrected_answer:    data.corrected_answer,
        sources:             data.sources,
        rag_used:            data.rag_used,
        rag_provider:        data.rag_provider,
        gpt_verified:        data.gpt_verified,
        gpt_verdict:         data.gpt_verdict,
        gpt_reasoning:       data.gpt_reasoning,
        mode:                data.mode,
        model_used:          data.model_used,
        knowledge_panel:     data.knowledge_panel,
        timestamp:           new Date().toISOString(),
      }

      const final = [...updated, aMsg]
      setMessages(final)
      setStatusMsg("")

      if (sessionId) {
        await updateSession(sessionId, final)
      } else {
        const title = generateTitle(q)
        const s     = await createSession(title, userId, mode)
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
    return (
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
        <p className="label" style={{ marginBottom: 8 }}>Sources</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {sources.map((src: Source, i: number) => (
            <a key={i} href={src.url || "#"} target="_blank" rel="noopener noreferrer"
               className="cite-chip" style={{ width: "fit-content" }}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1.5 5h7M6 2.5L8.5 5 6 7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {src.name || "Source"}
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
        <p style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.7,
                    display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
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
      <div style={{
        display: "flex", flexDirection: "column", gap: 6,
        padding: "12px 14px",
        background: "rgba(59,130,246,0.04)",
        border: "1px solid rgba(59,130,246,0.15)",
        borderRadius: 10, marginBottom: 8,
      }}>
        {/* Previous steps (dimmed) */}
        {statusHistory.slice(0, -1).map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="6" r="5" stroke="var(--green)" strokeWidth="1.2"/>
              <path d="M3.5 6l1.8 1.8L8.5 4.5" stroke="var(--green)" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>{s}</span>
          </div>
        ))}
        {/* Current step (animated) */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="anim-spin" style={{
            width: 10, height: 10, borderRadius: "50%",
            border: "1.5px solid var(--border)",
            borderTopColor: "var(--accent)", display: "inline-block", flexShrink: 0,
          }} />
          <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 500 }}>{statusMsg}</span>
        </div>
      </div>
    )
  }

  const modeColor = mode === "firewall" ? "var(--accent)" : mode === "compare" ? "var(--purple)" : "var(--text-2)"

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>

      {/* Top bar */}
      <div style={{
        padding: "10px 18px", borderBottom: "1px solid var(--border)",
        background: "var(--surface)", display: "flex",
        alignItems: "center", gap: 12, flexShrink: 0, flexWrap: "wrap",
      }}>
        <div style={{
          display: "flex", background: "var(--surface-2)",
          border: "1px solid var(--border)", borderRadius: 9, padding: 3, gap: 2,
        }}>
          {MODES.map(m => (
            <button key={m.id} onClick={() => setMode(m.id)}
              className={`mode-tab ${mode === m.id ? (m.id === "firewall" ? "active-blue" : m.id === "compare" ? "active-purple" : "active-green") : ""}`}
              title={m.desc}>
              {m.label}
            </button>
          ))}
        </div>

        {mode !== "compare" && (
          <div style={{
            display: "flex", background: "var(--surface-2)",
            border: "1px solid var(--border)", borderRadius: 9, padding: 3, gap: 2,
          }}>
            {(["gpt4", "gemini"] as Model[]).map(m => (
              <button key={m} onClick={() => setModel(m)}
                className={`mode-tab ${model === m ? "active-blue" : ""}`}>
                {m === "gpt4" ? "GPT-4" : "Gemini"}
              </button>
            ))}
          </div>
        )}

        <div style={{ flex: 1 }} />

        <Link href="/dashboard" style={{ textDecoration: "none" }}>
          <button className="btn btn-ghost" style={{ fontSize: 12 }}>Analytics →</button>
        </Link>
      </div>

      {/* Mode info bar */}
      {mode !== "chat" && (
        <div style={{
          padding: "6px 18px",
          background: mode === "firewall" ? "rgba(59,130,246,0.04)" : "rgba(167,139,250,0.04)",
          borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span className="anim-pulse" style={{
            width: 5, height: 5, borderRadius: "50%",
            background: modeColor, display: "inline-block", flexShrink: 0,
          }} />
          <span style={{ fontSize: 11, color: modeColor }}>
            {mode === "firewall"
              ? `Verified Research · DistilBERT → GPT-4 verification → RAG + Serper Google Search · model: ${model === "gpt4" ? "GPT-4" : "Gemini"}`
              : "Model Comparison · GPT-4 vs Gemini · both scored by DistilBERT"}
          </span>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 24px 0" }}>

        {messages.length === 0 && (
          <div className="anim-in" style={{ maxWidth: 580, margin: "0 auto", paddingTop: "6vh" }}>
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: "var(--accent)", display: "flex",
                  alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round"/>
                    <circle cx="8" cy="8" r="2" fill="#fff"/>
                  </svg>
                </div>
                <div>
                  <h1 className="display" style={{ fontSize: 20, fontWeight: 600, color: "var(--text)", lineHeight: 1.2 }}>
                    VerifyAI
                  </h1>
                  <p style={{ fontSize: 11, color: "var(--text-3)" }}>AI answers, human-grade verification</p>
                </div>
              </div>

              <p style={{ fontSize: 15, color: "var(--text-2)", lineHeight: 1.7, marginBottom: 24 }}>
                Ask any factual question. VerifyAI retrieves an answer, runs it through a trained hallucination classifier, and automatically corrects errors with real sources.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 24 }}>
                {MODES.map(m => (
                  <div key={m.id} onClick={() => setMode(m.id)} className="card"
                    style={{
                      padding: "12px", cursor: "pointer", transition: "all 0.15s",
                      borderColor: mode === m.id ? (m.id === "compare" ? "var(--purple)" : "var(--accent)") : undefined,
                      background:  mode === m.id ? (m.id === "compare" ? "rgba(167,139,250,0.05)" : "rgba(59,130,246,0.05)") : undefined,
                    }}
                  >
                    <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 3 }}>{m.label}</p>
                    <p style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}>{m.desc}</p>
                  </div>
                ))}
              </div>

              <div>
                <p className="label" style={{ marginBottom: 8 }}>Try in Verified Research mode</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {EXAMPLES.map(q => (
                    <button key={q}
                      onClick={() => { setMode("firewall"); setQuestion(q); inputRef.current?.focus() }}
                      className="btn btn-ghost" style={{ fontSize: 12, padding: "5px 10px" }}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          {messages.map((msg, i) => (
            <div key={i} className="anim-up" style={{ marginBottom: 20 }}>

              {msg.role === "user" && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <div className="card" style={{ maxWidth: "72%", padding: "10px 14px", background: "var(--surface-2)" }}>
                    <p style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.6 }}>{msg.question}</p>
                  </div>
                </div>
              )}

              {msg.role === "assistant" && msg.mode === "chat" && (
                <div style={{ maxWidth: "85%" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%",
                                   background: msg.model_used === "gemini" ? "var(--accent)" : "var(--green)",
                                   display: "inline-block" }} />
                    <span className="label">{msg.model_used === "gemini" ? "Gemini" : "GPT-4"}</span>
                  </div>
                  <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.7 }}>
                    {msg.model_used === "gemini" ? msg.gemini_raw_answer : msg.gpt_raw_answer}
                  </p>
                  <p style={{ fontSize: 10, color: "var(--text-3)", marginTop: 6 }}>
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              )}

              {msg.role === "assistant" && msg.mode === "firewall" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: "95%" }}>
                  {msg.status === "SKIPPED" ? (
                    <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.7 }}>
                      {msg.model_used === "gemini" ? msg.gemini_raw_answer : msg.gpt_raw_answer}
                    </p>
                  ) : (<>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <FirewallBadge status={msg.status!} />
                      <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </span>
                    </div>

                    <ConfidenceMeter score={msg.hallucination_score ?? 0} label={msg.confidence_label ?? ""} />

                    <div className="card" style={{ padding: "14px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <p className="label">{msg.model_used === "gemini" ? "Gemini" : "GPT-4"} · Raw Answer</p>
                        {msg.status !== "PASSED" && msg.status !== "VERIFIED" && (
                          <Tag label="Unverified" color="var(--amber)" />
                        )}
                      </div>
                      <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.7 }}>
                        {msg.model_used === "gemini" ? msg.gemini_raw_answer : msg.gpt_raw_answer}
                      </p>
                    </div>

                    {msg.knowledge_panel && <KnowledgePanel panel={msg.knowledge_panel} />}

                    {msg.gpt_verified && msg.gpt_reasoning && (
                      <div className="card-purple" style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                          <p className="label" style={{ color: "var(--purple)" }}>Second Opinion · GPT-4</p>
                          <Tag label={msg.gpt_verdict || ""} color={msg.gpt_verdict === "FACTUAL" ? "var(--green)" : "var(--red)"} />
                        </div>
                        <p style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.7 }}>{msg.gpt_reasoning}</p>
                      </div>
                    )}

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
                        {msg.sources && msg.sources.length > 0 && <Sources sources={msg.sources ?? []} />}
                      </div>
                    )}

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                      <MiniScore label="Hallucination" value={`${Math.round((msg.hallucination_score ?? 0) * 100)}%`}
                        color={(msg.hallucination_score ?? 0) >= 0.6 ? "var(--red)" : "var(--green)"} />
                      <MiniScore label="Factual" value={`${Math.round((msg.factual_score ?? 0) * 100)}%`}
                        color="var(--green)" />
                      <MiniScore label="RAG Used" value={msg.rag_used ? "Yes" : "No"}
                        color={msg.rag_used ? "var(--accent)" : "var(--text-3)"} />
                    </div>
                  </>)}
                </div>
              )}

              {msg.role === "assistant" && msg.mode === "compare" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Tag label="Model Comparison" color="var(--purple)" />
                    <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div className="card" style={{ padding: 14 }}>
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
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 10, color: "var(--text-3)" }}>Risk score</span>
                          <span style={{
                            fontSize: 10, fontFamily: "'DM Mono', monospace", fontWeight: 500,
                            color: (msg.hallucination_score ?? 0) >= 0.6 ? "var(--red)" : "var(--green)",
                          }}>
                            {Math.round((msg.hallucination_score ?? 0) * 100)}%
                          </span>
                        </div>
                        <div className="progress-track">
                          <div className="progress-fill" style={{
                            width: `${Math.round((msg.hallucination_score ?? 0) * 100)}%`,
                            background: (msg.hallucination_score ?? 0) >= 0.6 ? "var(--red)" : "var(--green)",
                          }} />
                        </div>
                      </div>
                    </div>

                    <div className="card" style={{ padding: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />
                          <p className="label">Gemini</p>
                        </div>
                        <FirewallBadge status={msg.gemini_status || "UNKNOWN"} />
                      </div>
                      <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.7, marginBottom: 12 }}>
                        {msg.gemini_raw_answer}
                      </p>
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 10, color: "var(--text-3)" }}>Risk score</span>
                          <span style={{
                            fontSize: 10, fontFamily: "'DM Mono', monospace", fontWeight: 500,
                            color: (msg.gemini_score ?? 0) >= 0.6 ? "var(--red)" : "var(--green)",
                          }}>
                            {Math.round((msg.gemini_score ?? 0) * 100)}%
                          </span>
                        </div>
                        <div className="progress-track">
                          <div className="progress-fill" style={{
                            width: `${Math.round((msg.gemini_score ?? 0) * 100)}%`,
                            background: (msg.gemini_score ?? 0) >= 0.6 ? "var(--red)" : "var(--green)",
                          }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {msg.hallucination_score != null && msg.gemini_score != null && (
                    <div className="card" style={{
                      padding: "10px 14px", textAlign: "center",
                      borderColor: msg.hallucination_score < msg.gemini_score ? "rgba(34,197,94,0.25)"
                                 : msg.gemini_score < msg.hallucination_score ? "rgba(59,130,246,0.25)"
                                 : "var(--border)",
                    }}>
                      <span style={{ fontSize: 12, color: "var(--text-2)" }}>
                        {msg.hallucination_score < msg.gemini_score
                          ? "GPT-4 scored more factual on this question"
                          : msg.gemini_score < msg.hallucination_score
                          ? "Gemini scored more factual on this question"
                          : "Both models scored equally"}
                      </span>
                    </div>
                  )}

                  {msg.knowledge_panel && <KnowledgePanel panel={msg.knowledge_panel} />}
                  {msg.corrected_answer && (
                    <div className="card-green" style={{ padding: "12px 14px" }}>
                      <p className="label" style={{ color: "var(--green)", marginBottom: 8 }}>Grounded Answer</p>
                      <p style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.7 }}>{msg.corrected_answer}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Loading skeleton + live status */}
          {loading && (
            <div className="anim-in" style={{ marginBottom: 20 }}>
              <LiveStatus />
              {!statusMsg && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span className="anim-spin" style={{
                    width: 12, height: 12, borderRadius: "50%",
                    border: `2px solid var(--border)`,
                    borderTopColor: "var(--accent)", display: "inline-block",
                  }} />
                  <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                    {mode === "compare" ? "Querying both models…"
                     : mode === "firewall" ? "Running verification pipeline…"
                     : "Thinking…"}
                  </span>
                </div>
              )}
              {mode === "compare" ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {[0,1].map(i => (
                    <div key={i} className="card" style={{ padding: 14 }}>
                      <div className="skeleton" style={{ height: 12, width: "40%", marginBottom: 12, borderRadius: 4 }} />
                      <div className="skeleton" style={{ height: 10, width: "100%", marginBottom: 6, borderRadius: 4 }} />
                      <div className="skeleton" style={{ height: 10, width: "75%", borderRadius: 4 }} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="card" style={{ padding: 14 }}>
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
      <div style={{
        flexShrink: 0, padding: "14px 24px 18px",
        borderTop: "1px solid var(--border)",
        background: "var(--surface)",
      }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <div style={{
            display: "flex", gap: 8, alignItems: "center",
            background: "var(--surface-2)", border: "1px solid var(--border)",
            borderRadius: 11, padding: "4px 4px 4px 14px",
            transition: "border-color 0.15s",
          }}>
            <input
              ref={inputRef}
              type="text"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={handleKey}
              placeholder={
                mode === "compare"   ? "Ask — GPT-4 and Gemini will both answer…" :
                mode === "firewall"  ? "Ask a factual question to verify…" :
                                       "Ask anything…"
              }
              style={{
                flex: 1, background: "transparent", border: "none",
                outline: "none", color: "var(--text)", fontSize: 14,
                fontFamily: "'DM Sans', sans-serif", padding: "6px 0",
              }}
            />
            <button
              onClick={handleSubmit}
              disabled={loading || !question.trim()}
              className="btn btn-primary"
              style={{ borderRadius: 8, padding: "8px 16px", flexShrink: 0 }}
            >
              {loading ? (
                <span className="anim-spin" style={{
                  width: 12, height: 12, borderRadius: "50%",
                  border: "2px solid rgba(255,255,255,0.3)",
                  borderTopColor: "#fff", display: "inline-block",
                }} />
              ) : mode === "compare" ? "Compare" : "Send"}
            </button>
          </div>
          <p style={{ fontSize: 10, color: "var(--text-3)", textAlign: "center", marginTop: 8 }}>
            {mode === "firewall"
              ? "DistilBERT → GPT-4 verification → Serper Google + Wikipedia + News (parallel)"
              : mode === "compare"
              ? "Both models scored independently by DistilBERT (F1 0.962)"
              : `${model === "gemini" ? "Gemini" : "GPT-4"} · no fact-checking · switch to Verified Research for verification`}
          </p>
        </div>
      </div>
    </div>
  )
}