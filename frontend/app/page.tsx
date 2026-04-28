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
  const [isSidebarOpen, setIsSidebarOpen]       = useState(false)
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
    <main className="min-h-screen bg-background text-on-surface flex overflow-hidden">
      {user && (
        <>
          {isSidebarOpen && (
            <div 
              className="fixed inset-0 bg-black/80 z-40 md:hidden" 
              onClick={() => setIsSidebarOpen(false)} 
            />
          )}
          <Sidebar
            currentSessionId={currentSessionId}
            onSelectSession={(id) => {
              setCurrentSessionId(id)
              setIsSidebarOpen(false)
            }}
            onNewChat={() => {
              setCurrentSessionId(null)
              setIsSidebarOpen(false)
            }}
            userId={user.id}
            user={user}
            isOpen={isSidebarOpen}
            onClose={() => setIsSidebarOpen(false)}
          />
        </>
      )}
      <div className="flex-1 h-screen overflow-hidden bg-background relative pl-0 md:pl-60">
        <ChatWindow
          sessionId={currentSessionId}
          onSessionCreated={(id) => {
            setCurrentSessionId(id)
          }}
          userId={user?.id}
          user={user}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        />
      </div>
    </main>
  )
}