"use client"

import { useState, useEffect, useRef } from "react"
import { supabase } from "../../lib/supabase"
import { useRouter } from "next/navigation"

type Mode = "login" | "signup"

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const dotRef = useRef<HTMLDivElement>(null)

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

  // Cursor tracking
  useEffect(() => {
    const dot = dotRef.current;
    if (!dot) return;

    const move = (e: MouseEvent) => {
      dot.style.left = e.clientX + 'px';
      dot.style.top = e.clientY + 'px';
    };

    const grow = () => {
      dot.style.width = '12px';
      dot.style.height = '12px';
      dot.style.background = 'white';
      dot.style.boxShadow = '0 0 30px 10px rgba(255, 255, 255, 0.4)';
    };

    const shrink = () => {
      dot.style.width = '5px';
      dot.style.height = '5px';
      dot.style.background = 'white';
      dot.style.boxShadow = '0 0 15px 4px rgba(255, 255, 255, 0.2)';
    };

    window.addEventListener('mousemove', move);

    const interactables = document.querySelectorAll('button, a, input, .feature-pill');
    interactables.forEach(el => {
      el.addEventListener('mouseenter', grow);
      el.addEventListener('mouseleave', shrink);
    });

    return () => {
      window.removeEventListener('mousemove', move);
      interactables.forEach(el => {
        el.removeEventListener('mouseenter', grow);
        el.removeEventListener('mouseleave', shrink);
      });
    };
  }, [mode]);

  return (
    <div className="auth-page relative flex flex-col" style={{ height: '100vh', overflow: 'hidden', background: '#020305' }}>
      {/* Cursor Dot */}
      <div ref={dotRef} className="cursor-dot" />

      {/* Noise Overlay */}
      <div className="noise-overlay" />

      {/* Mesh Background */}
      <div className="mesh-background" />

      {/* Top Branding */}
      <header className="absolute top-0 left-0 w-full p-8 md:p-12 flex justify-between items-center z-40">
        <div className="flex items-center gap-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <div className="flex flex-col">
            <h1 className="text-white text-lg tracking-[0.3em] uppercase leading-none font-extrabold">VerifyAI</h1>
            <p className="text-[10px] text-white/20 tracking-[0.1em] font-bold mt-1.5 uppercase">Cognitive Audit Engine</p>
          </div>
        </div>
      </header>

      {/* Main Login Section */}
      <main className="flex-1 flex items-center justify-center p-6 relative z-10">
        <div className="w-full max-w-[500px]">
          <div className="auth-card">
            <div className="auth-card-inner">
              <div className="flex flex-col items-center mb-8">
                <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.05] flex items-center justify-center mb-8 shadow-2xl backdrop-blur-md">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5">
                    <path d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                  </svg>
                </div>
                <h2 className="text-4xl text-white tracking-tighter mb-3 font-extrabold">SECURE ACCESS</h2>
                <p className="text-white/20 text-xs uppercase tracking-[0.2em] font-bold">Verification Level 4 • Protocol Active</p>
              </div>

              <form className="space-y-7" onSubmit={handleSubmit}>
                <div className="stagger-in" style={{ animationDelay: '0.1s' }}>

                  {mode === 'signup' && (
                    <div className="mb-6">
                      <label className="block text-[10px] font-bold text-white/30 uppercase tracking-[0.25em] mb-3 ml-1">Analyst Identity</label>
                      <input
                        type="text"
                        placeholder="Full name"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        className="w-full auth-input h-14 px-6 rounded-2xl text-white placeholder:text-white/10 focus:ring-0 text-sm premium-transition"
                      />
                    </div>
                  )}

                  <div className="mb-6">
                    <label className="block text-[10px] font-bold text-white/30 uppercase tracking-[0.25em] mb-3 ml-1">Credentials Target</label>
                    <input
                      type="email"
                      placeholder="identity@intel.verify.ai"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full auth-input h-14 px-6 rounded-2xl text-white placeholder:text-white/10 focus:ring-0 text-sm premium-transition"
                    />
                  </div>

                  <div className="mb-8">
                    <label className="block text-[10px] font-bold text-white/30 uppercase tracking-[0.25em] mb-3 ml-1">Access Sequence</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full auth-input h-14 px-6 rounded-2xl text-white placeholder:text-white/10 focus:ring-0 text-lg tracking-widest premium-transition"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    />
                  </div>

                  {error && <p className="text-red-400 text-xs text-center font-semibold mb-4">{error}</p>}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-14 bg-white text-black font-bold rounded-2xl btn-shimmer btn-premium btn-press shadow-xl disabled:opacity-50"
                  >
                    {loading ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                        Processing...
                      </div>
                    ) : (
                      mode === 'login' ? 'Initialize Session' : 'Provision Account'
                    )}
                  </button>
                </div>
              </form>

              <div className="relative my-8">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/[0.03]"></div>
                </div>
                <div className="relative flex justify-center text-[10px] uppercase tracking-[0.4em] font-bold">
                  <span className="px-6 bg-[#050608] text-white/10">Security Handshake</span>
                </div>
              </div>

              <button
                type="button"
                onClick={async () => {
                  await supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: { redirectTo: `${window.location.origin}/` }
                  })
                }}
                className="w-full h-14 border border-white/[0.05] hover:border-white/[0.1] bg-white/[0.02] text-white/70 font-bold rounded-2xl flex items-center justify-center gap-4 premium-transition btn-premium btn-press shadow-inner"
              >
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Authorize via Google
              </button>

              <p className="mt-8 text-center text-[11px] text-white/20 tracking-wide uppercase font-bold">
                {mode === 'login' ? 'New analyst?' : 'Already authorized?'}
                <a
                  href="#"
                  onClick={toggleMode}
                  className="text-white/60 hover:text-white premium-transition ml-1 underline underline-offset-4 decoration-white/10"
                >
                  {mode === 'login' ? 'Provision Account' : 'Sign In'}
                </a>
              </p>
            </div>
          </div>
        </div>
      </main>

    </div>
  )
}