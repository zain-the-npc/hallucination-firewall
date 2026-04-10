"use client"

import { useState, useRef, useEffect } from "react"
import ConfidenceMeter from "./ConfidenceMeter"
import FirewallBadge from "./FirewallBadge"
import { askFirewall } from "../lib/api"

interface Result {
  question: string
  gpt_raw_answer: string
  hallucination_score: number
  factual_score: number
  confidence_label: string
  status: string
  corrected_answer: string | null
  sources: string[]
  rag_used: boolean
}

export default function ChatBox() {
  const [question, setQuestion] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<Result[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (result && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }, [result])

  async function handleSubmit() {
    if (!question.trim() || loading) return
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const data = await askFirewall(question.trim())
      setResult(data)
      setHistory(prev => [data, ...prev].slice(0, 10))
    } catch (e) {
      setError("Failed to reach the firewall. Is the backend running?")
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) handleSubmit()
  }

  const exampleQuestions = [
    "How many bones does a shark have?",
    "Who invented the telephone?",
    "What is the speed of light?",
    "When did World War 2 end?",
  ]

  return (
    <div className="w-full max-w-3xl mx-auto">

      {/* Input Area */}
      <div className="glass rounded-2xl p-2 mb-6 flex gap-2 items-center
                      focus-within:border-blue-500/50 transition-all duration-300">
        <input
          ref={inputRef}
          type="text"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask anything — the firewall will check it..."
          className="flex-1 bg-transparent px-4 py-3 text-white placeholder-gray-600
                     outline-none text-base"
        />
        <button
          onClick={handleSubmit}
          disabled={loading || !question.trim()}
          className="px-6 py-3 rounded-xl font-semibold text-sm
                     bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800
                     disabled:text-gray-600 text-white transition-all duration-200
                     active:scale-95 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-white/30 border-t-white
                               rounded-full animate-spin" />
              Scanning...
            </span>
          ) : "Send →"}
        </button>
      </div>

      {/* Example Questions */}
      {!result && !loading && (
        <div className="animate-fade-in mb-8">
          <p className="text-xs text-gray-600 uppercase tracking-widest mb-3 text-center">
            Try these examples
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {exampleQuestions.map(q => (
              <button
                key={q}
                onClick={() => { setQuestion(q); inputRef.current?.focus() }}
                className="px-3 py-1.5 rounded-full text-xs text-gray-400
                           border border-gray-800 hover:border-gray-600
                           hover:text-gray-200 transition-all duration-200"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="animate-fade-in glass rounded-2xl p-8 text-center mb-6">
          <div className="flex justify-center gap-1 mb-4">
            {[0, 1, 2, 3, 4].map(i => (
              <div
                key={i}
                className="w-1 bg-blue-500 rounded-full animate-pulse"
                style={{
                  height: `${20 + Math.random() * 20}px`,
                  animationDelay: `${i * 0.1}s`
                }}
              />
            ))}
          </div>
          <p className="text-gray-400 text-sm">Running through the firewall...</p>
          <p className="text-gray-600 text-xs mt-1">GPT → Classifier → RAG (if needed)</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="glass-red rounded-xl p-4 mb-6 animate-slide-up">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div ref={resultRef} className="animate-slide-up space-y-4 mb-12">

          {/* Status Badge */}
          <div className="flex justify-center">
            <FirewallBadge status={result.status} />
          </div>

          {/* Confidence Meter */}
          <ConfidenceMeter
            score={result.hallucination_score}
            label={result.confidence_label}
          />

          {/* GPT Raw Answer */}
          <div className="glass rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-gray-500" />
              <span className="text-xs text-gray-500 uppercase tracking-widest font-semibold">
                GPT-4 Raw Answer
              </span>
              {result.status !== "PASSED" && (
                <span className="ml-auto text-xs text-red-400 border border-red-900
                                 px-2 py-0.5 rounded-full">
                  Unverified
                </span>
              )}
            </div>
            <p className="text-gray-300 leading-relaxed text-sm">
              {result.gpt_raw_answer}
            </p>
          </div>

          {/* Corrected Answer */}
          {result.corrected_answer && (
            <div className="glass-green rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs text-green-400 uppercase tracking-widest font-semibold">
                  RAG-Grounded Correction
                </span>
              </div>
              <p className="text-gray-200 leading-relaxed text-sm">
                {result.corrected_answer}
              </p>

              {/* Sources */}
              {result.sources.length > 0 && (
                <div className="mt-4 pt-4 border-t border-green-900/40">
                  <p className="text-xs text-gray-500 mb-2 uppercase tracking-widest">
                    Sources
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {result.sources.map((src, i) => (
                      <span
                        key={i}
                        className="text-xs px-2 py-1 rounded-full bg-green-900/30
                                   text-green-400 border border-green-900/50"
                      >
                        {src}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Score Details */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Hallucination", value: `${Math.round(result.hallucination_score * 100)}%`, color: "text-red-400" },
              { label: "Factual", value: `${Math.round(result.factual_score * 100)}%`, color: "text-green-400" },
              { label: "RAG Used", value: result.rag_used ? "Yes" : "No", color: result.rag_used ? "text-blue-400" : "text-gray-500" },
            ].map(stat => (
              <div key={stat.label} className="glass rounded-xl p-4 text-center">
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">
                  {stat.label}
                </p>
                <p className={`text-xl font-bold font-mono ${stat.color}`}>
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          {/* Ask another */}
          <button
            onClick={() => { setResult(null); setQuestion(""); inputRef.current?.focus() }}
            className="w-full py-3 rounded-xl text-sm text-gray-500
                       border border-gray-800 hover:border-gray-600
                       hover:text-gray-300 transition-all duration-200"
          >
            Ask another question
          </button>
        </div>
      )}

      {/* History */}
      {history.length > 1 && (
        <div className="mt-4">
          <p className="text-xs text-gray-600 uppercase tracking-widest mb-3">
            Recent queries
          </p>
          <div className="space-y-2">
            {history.slice(1).map((h, i) => (
              <div
                key={i}
                onClick={() => { setQuestion(h.question); setResult(h) }}
                className="glass rounded-xl px-4 py-3 flex items-center
                           justify-between cursor-pointer hover:border-gray-700
                           transition-all duration-200 group"
              >
                <span className="text-sm text-gray-400 group-hover:text-gray-200
                                 truncate flex-1 transition-colors">
                  {h.question}
                </span>
                <span className={`text-xs font-mono ml-3 flex-shrink-0 ${h.status === "PASSED" ? "text-green-500"
                    : h.status === "CORRECTED" ? "text-blue-500"
                      : "text-yellow-500"
                  }`}>
                  {Math.round(h.hallucination_score * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}