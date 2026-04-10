import { supabase } from "./supabase"

export async function createSession(title: string, userId: string, mode: string = "chat") {
  const { data, error } = await supabase
    .from("chat_sessions")
    .insert({
      title,
      user_id:  userId,
      messages: [],
      mode:     mode
    })
    .select()
    .single()

  if (error) throw error
  return data
}
export async function getSessions(userId: string) {
  const { data, error } = await supabase
    .from("chat_sessions")
    .select("id, title, created_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })

  if (error) throw error
  return data
}

export async function getSession(sessionId: string) {
  const { data, error } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("id", sessionId)
    .single()

  if (error) throw error
  return data
}

export async function updateSession(
  sessionId: string,
  messages: any[],
  title?: string
) {
  const update: any = {
    messages,
    updated_at: new Date().toISOString()
  }
  if (title) update.title = title

  const { error } = await supabase
    .from("chat_sessions")
    .update(update)
    .eq("id", sessionId)

  if (error) throw error
}

export async function deleteSession(sessionId: string) {
  const { error } = await supabase
    .from("chat_sessions")
    .delete()
    .eq("id", sessionId)

  if (error) throw error
}

export function generateTitle(question: string): string {
  return question.length > 40
    ? question.substring(0, 40) + "..."
    : question
}