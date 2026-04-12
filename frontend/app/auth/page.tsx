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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
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

  function toggleMode(e: React.MouseEvent) {
    e.preventDefault();
    setMode(mode === "login" ? "signup" : "login");
    setError(null);
  }

  return (
    <div className="font-body text-on-surface flex flex-col min-h-screen" style={{
        backgroundColor: '#131313',
        backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.03) 1px, transparent 0)',
        backgroundSize: '40px 40px'
    }}>
      {/* TopNavBar */}
      <header className="fixed top-0 w-full z-50">
        <div className="flex justify-between items-center px-8 py-6 w-full max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 flex items-center justify-center bg-surface-container rounded-lg border border-outline-variant/20">
              <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>hexagon</span>
            </div>
            <span className="text-2xl font-bold tracking-tighter text-slate-100 font-headline">VerifyAI</span>
          </div>
          <div className="hidden md:flex gap-6 items-center">
            <span className="material-symbols-outlined text-slate-500 hover:text-indigo-200 transition-colors cursor-pointer" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>help</span>
            <span className="material-symbols-outlined text-slate-500 hover:text-indigo-200 transition-colors cursor-pointer" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>info</span>
          </div>
        </div>
      </header>

      <main className="flex-grow flex flex-col items-center justify-center px-4 relative">
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-primary/5 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-tertiary/5 rounded-full blur-[120px]"></div>

        {/* Login Card */}
        <div className="w-full max-w-[440px] p-10 rounded-2xl border border-outline-variant/20 shadow-2xl relative z-10"
             style={{ background: "rgba(28, 27, 27, 0.6)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
          
          <div className="flex flex-col items-center mb-8">
            <div className="relative mb-6">
              <span className="material-symbols-outlined text-primary text-5xl" style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>hexagon</span>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-3 h-3 bg-on-primary rounded-full shadow-[0_0_15px_rgba(192,193,255,0.6)]"></div>
              </div>
            </div>
            <h1 className="font-headline text-3xl font-extrabold tracking-tight mb-2 text-on-surface">
              {mode === "login" ? "Sign in to your account" : "Create an account"}
            </h1>
            <p className="text-on-surface-variant font-medium text-sm">Welcome back to the Digital Curator.</p>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            {mode === "signup" && (
              <div className="space-y-2">
                <label className="block font-label text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant ml-1">Full Name</label>
                <input 
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 text-on-surface placeholder:text-outline/50 focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/40 transition-all font-body" 
                  placeholder="Your name" type="text"
                  value={name} onChange={e => setName(e.target.value)}
                />
              </div>
            )}
            
            <div className="space-y-2">
              <label className="block font-label text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant ml-1">Email Address</label>
              <input 
                className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 text-on-surface placeholder:text-outline/50 focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/40 transition-all font-body" 
                placeholder="name@company.com" type="email"
                value={email} onChange={e => setEmail(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between items-center ml-1">
                <label className="block font-label text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">Password</label>
                {mode === "login" && (
                  <a className="font-label text-[10px] font-bold uppercase tracking-[0.1em] text-primary hover:text-primary-container transition-colors" href="#">Forgot Password?</a>
                )}
              </div>
              <input 
                className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 text-on-surface placeholder:text-outline/50 focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/40 transition-all font-body" 
                placeholder="••••••••" type="password"
                value={password} onChange={e => setPassword(e.target.value)}
              />
            </div>

            {error && <p className="text-red-500 text-sm font-semibold text-center">{error}</p>}
            
            <button 
              className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold py-3.5 rounded-full hover:shadow-[0_0_20px_rgba(128,131,255,0.3)] transform active:scale-[0.98] transition-all duration-200 flex justify-center items-center h-[52px]" 
              type="submit" disabled={loading}
            >
              {loading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-on-primary border-t-transparent"></div>
              ) : (mode === "login" ? "Sign in" : "Create Account")}
            </button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-on-surface-variant text-sm">
              {mode === "login" ? "New to the ecosystem? " : "Already have an account? "}
              <a className="text-primary font-semibold hover:underline underline-offset-4 ml-1 cursor-pointer" onClick={toggleMode}>
                {mode === "login" ? "Create Account" : "Sign in"}
              </a>
            </p>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl w-full">
          <div className="flex flex-col items-center md:items-start group">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-2 h-2 rounded-full bg-tertiary shadow-[0_0_8px_#ffb783]"></div>
              <span className="font-headline font-bold text-on-surface text-sm tracking-tight">DistilBERT classifier</span>
            </div>
            <p className="text-on-surface-variant text-xs text-center md:text-left leading-relaxed">High-precision detection with a benchmarked 96.2% F1 score.</p>
          </div>
          <div className="flex flex-col items-center md:items-start group">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_#c0c1ff]"></div>
              <span className="font-headline font-bold text-on-surface text-sm tracking-tight">GPT-4 + Groq</span>
            </div>
            <p className="text-on-surface-variant text-xs text-center md:text-left leading-relaxed">Dual-engine inference ensuring verifiable intelligence at scale.</p>
          </div>
          <div className="flex flex-col items-center md:items-start group">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-2 h-2 rounded-full bg-secondary shadow-[0_0_8px_#c3c0ff]"></div>
              <span className="font-headline font-bold text-on-surface text-sm tracking-tight">RAG-grounded corrections</span>
            </div>
            <p className="text-on-surface-variant text-xs text-center md:text-left leading-relaxed">Source-backed validation loops to eliminate algorithmic hallucination.</p>
          </div>
        </div>
      </main>

      <footer className="fixed bottom-0 w-full z-50 pointer-events-none">
        <div className="flex justify-center gap-8 px-4 py-10 w-full pointer-events-auto">
          <span className="text-slate-500 font-inter text-xs tracking-wider uppercase">© 2024 VerifyAI. All rights reserved.</span>
          <div className="hidden sm:flex gap-6">
            <a className="text-slate-500 font-inter text-xs tracking-wider uppercase hover:text-indigo-200 transition-opacity" href="#">Privacy Policy</a>
            <a className="text-slate-500 font-inter text-xs tracking-wider uppercase hover:text-indigo-200 transition-opacity" href="#">System Status</a>
          </div>
        </div>
      </footer>

      {/* Aesthetic Decorative Image Elements */}
      <div className="fixed top-20 right-20 w-64 h-64 opacity-10 pointer-events-none mix-blend-screen">
        <img className="w-full h-full object-contain" alt="abstract digital topography with glowing indigo lines and geometric data clusters on dark background" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDW6Y2l4o_J-TssnyzkDnBbG9MJXIO3zeJ8W_2k3uSagHtUAE0je4NPpXUPh34E9MyP-0Z2Ng9mlq6TYbTx-eFeaVNSTW2Zg9ePJwgPSnmgz8YU21AeJgFtBvb8gS0MRx7s3dUuu0g55h5WPE_TUmU3cDaThUUSPDEVKpGG2HlHpUIvyelGYe3uK2YQz4VZVnrzH0qkjTzSAi5rbI1rUWLHhJZL6zbG768e9_X9VlxWKXCCAtWAVS1URL4qPtKESgTm181resu_aWs"/>
      </div>
    </div>
  )
}