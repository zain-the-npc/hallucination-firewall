"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../lib/supabase"
import Sidebar from "../components/Sidebar"
import ChatWindow from "../components/ChatWindow"

export default function Home() {
  const [user, setUser]                         = useState<any>(null)
  const [loading, setLoading]                   = useState(true)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const router                                  = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push("/auth")
      } else {
        setUser(session.user)
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session) router.push("/auth")
        else {
          setUser(session.user)
          setLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex gap-1">
          {[0,1,2].map(i => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-black text-white flex">
      {user && (
        <Sidebar
          currentSessionId={currentSessionId}
          onSelectSession={setCurrentSessionId}
          onNewChat={() => setCurrentSessionId(null)}
          userId={user.id}
          user={user}
        />
      )}
      <div className="flex-1 overflow-hidden">
        <ChatWindow
          sessionId={currentSessionId}
          onSessionCreated={setCurrentSessionId}
          userId={user?.id}
        />
      </div>
    </main>
  )
}