"use client"

import { useState } from "react"
import { supabase } from "../../lib/supabase"
import { useRouter } from "next/navigation"

type Mode = "login" | "signup"

export default function AuthPage() {
  const [mode,     setMode]     = useState<Mode>("login")
  const [email,    setEmail]    = useState("")
  const [password, setPassword] = useState("")
  const [name,     setName]     = useState("")
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit() {
    setLoading(true); setError(null)
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email, password, options: { data: { full_name: name } }
        })
        if (error) throw error
        if (data.session) router.push("/")
        else setError("Account created. Please sign in.")
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.push("/")
      }
    } catch (e: any) {
      if (e.message?.includes("already registered")) {
        setError("Email already registered. Sign in instead.")
        setMode("login")
      } else {
        setError(e.message)
      }
    } finally { setLoading(false) }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSubmit()
  }

  return (
    <main style={{
      minHeight: "100vh", background: "var(--bg)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'DM Sans', sans-serif", padding: "24px",
    }}>
      {/* Subtle grid */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        backgroundImage: "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
        backgroundSize: "60px 60px", opacity: 0.4,
      }} />

      <div style={{ position: "relative", width: "100%", maxWidth: 360 }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 44, height: 44, borderRadius: 12,
            background: "var(--accent)", marginBottom: 14,
          }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M11 2L19 6.5V15.5L11 20L3 15.5V6.5L11 2Z" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round"/>
              <circle cx="11" cy="11" r="3" fill="#fff"/>
            </svg>
          </div>
          <h1 className="display" style={{
            fontSize: 26, fontWeight: 600, color: "var(--text)",
            letterSpacing: "-0.02em", marginBottom: 4,
          }}>
            VerifyAI
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-2)" }}>
            {mode === "login" ? "Sign in to your account" : "Create a free account"}
          </p>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: "24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {mode === "signup" && (
              <div>
                <label style={{ display: "block", marginBottom: 6, fontSize: 11,
                                 color: "var(--text-2)", fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  Full Name
                </label>
                <input
                  type="text" value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Your name"
                  className="input"
                />
              </div>
            )}

            <div>
              <label style={{ display: "block", marginBottom: 6, fontSize: 11,
                               color: "var(--text-2)", fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Email
              </label>
              <input
                type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={handleKey}
                placeholder="you@example.com"
                className="input"
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: 6, fontSize: 11,
                               color: "var(--text-2)", fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Password
              </label>
              <input
                type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={handleKey}
                placeholder="••••••••"
                className="input"
              />
            </div>

            {error && (
              <div className="card-red" style={{ padding: "9px 12px" }}>
                <p style={{ fontSize: 12, color: "var(--red)" }}>{error}</p>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={loading || !email || !password || (mode === "signup" && !name)}
              className="btn btn-primary"
              style={{ justifyContent: "center", width: "100%", padding: "11px", fontSize: 14 }}
            >
              {loading ? (
                <span className="anim-spin" style={{
                  width: 14, height: 14, borderRadius: "50%",
                  border: "2px solid rgba(255,255,255,0.3)",
                  borderTopColor: "#fff", display: "inline-block",
                }} />
              ) : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </div>
        </div>

        <p style={{ textAlign: "center", fontSize: 12, color: "var(--text-3)", marginTop: 16 }}>
          {mode === "login" ? "No account?" : "Already have one?"}{" "}
          <button
            onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null) }}
            style={{
              background: "none", border: "none", color: "var(--accent)",
              cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {mode === "login" ? "Sign up" : "Sign in"}
          </button>
        </p>

        {/* Feature list */}
        <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            "DistilBERT classifier · 96.2% F1",
            "GPT-4 + Groq · both verifiable",
            "RAG-grounded corrections with sources",
          ].map(f => (
            <div key={f} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: "var(--text-3)" }}>{f}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}