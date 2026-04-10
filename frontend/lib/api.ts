const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export async function askFirewall(
  question: string,
  mode:     "chat" | "firewall" | "compare" = "chat",
  model:    "gpt4" | "gemini"               = "gpt4"
) {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ question, mode, model })
  })
  if (!res.ok) throw new Error("API call failed")
  return res.json()
}

export async function fetchLogs(limit = 50) {
  const res = await fetch(`${BASE_URL}/api/logs?limit=${limit}`)
  if (!res.ok) throw new Error("Failed to fetch logs")
  return res.json()
}

export async function fetchStats() {
  const res = await fetch(`${BASE_URL}/api/stats`)
  if (!res.ok) throw new Error("Failed to fetch stats")
  return res.json()
}