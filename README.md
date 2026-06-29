# 🛡️ VerifyAI — Hallucination Firewall

> **An AI that catches other AIs lying.** A real-time firewall that intercepts LLM responses, scores them for hallucination risk, and corrects them with grounded sources — before the answer ever reaches you.

🔗 **Live App:** [verifyai-navy.vercel.app](https://verifyai-navy.vercel.app/)
💻 **Source:** [github.com/zain-the-npc/hallucination-firewall](https://github.com/zain-the-npc/hallucination-firewall)

---

## 🧠 What It Does

LLMs like GPT-4 and LLaMA confidently state wrong facts with the same tone as right ones. VerifyAI sits between the user and the model's output, running every answer through a multi-layer verification pipeline:

1. **Intent classification** — GPT-4 decides if a query is factual, conversational, or ambiguous
2. **Answer generation** — GPT-4 or Groq (LLaMA 3.1 8B) generates the response
3. **Custom DistilBERT classifier** — fine-tuned from scratch, scores hallucination probability 0.0–1.0
4. **Cross-model verification** — the *opposite* model independently fact-checks the first one's answer
5. **Weighted scoring** — combines both signals with a hard floor so a flagged hallucination can never slip through on a technicality
6. **RAG correction** — Wikipedia + Google Search (Serper) + NewsAPI run in parallel to ground and rewrite flagged answers with real citations

---

## ✨ Features

- ⚡ **Real-time hallucination scoring** on every response, 0.0 to 1.0
- 🔍 **RAG-grounded auto-correction** when a hallucination is detected
- 🥊 **Model Comparison mode** — GPT-4 vs Groq, head-to-head, lowest-risk answer wins
- 🔐 **Full auth system** — Email/Password + Google OAuth via Supabase
- 📊 **Persistent session history** with full chat logging to Postgres
- 📱 **Responsive UI** built for both desktop and mobile

---

## 🏗️ Architecture 

```
User Question
      │
      ▼
┌─────────────┐
│  Next.js    │  ← Frontend (Vercel)
│  Frontend   │
└──────┬──────┘
       │ HTTP POST (SSE stream)
       ▼
┌─────────────────────────────┐
│     FastAPI Backend         │  ← HuggingFace Spaces (Docker)
│                             │
│  1. GPT-4 / Groq answers   │
│  2. DistilBERT scores it   │
│  3. Cross-model verifies   │
│  4. RAG corrects if needed │
│  5. Sources returned       │
└──────┬──────────────────────┘
       │
       ├── HuggingFace Hub (DistilBERT model)
       ├── OpenAI API (GPT-4)
       ├── Groq API (LLaMA 3.1)
       ├── Serper API (Google Search)
       ├── Wikipedia REST API
       ├── NewsAPI
       └── Supabase (auth + logging)
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js (App Router), TypeScript, TailwindCSS, SSE streaming |
| **Backend** | FastAPI, Python, Uvicorn, Docker |
| **ML / Classifier** | HuggingFace Transformers, DistilBERT (fine-tuned), PyTorch |
| **LLMs** | OpenAI GPT-4, Groq (LLaMA 3.1 8B Instant) |
| **Search / RAG** | Serper API (Google Search), Wikipedia REST API, NewsAPI |
| **Database & Auth** | Supabase (PostgreSQL + Auth, incl. Google OAuth) |
| **Deployment** | Vercel (frontend), HuggingFace Spaces (backend) |

---

## 🧪 The Classifier

The DistilBERT model was fine-tuned from `distilbert-base-uncased` on:

- **HaluEval** — myth-style correct vs. hallucinated answer pairs
- **TruthfulQA** — common misconceptions people wrongly believe
- **Natural Questions** — 8,000 short, clean Q&A pairs (fixes short-answer bias)
- **500+ Groq-generated hard negatives** — topically similar wrong answers to the same question (fixes yes/no confirmation bias)

**Scoring logic** combines the classifier's score with a live cross-model verdict from the opposite LLM. If the verifier flags a hallucination, the score is mathematically floored into the "uncertain" zone — so a confident-sounding wrong answer can't slip through just because the classifier alone scored it low.

| Score Range | Label | Action |
|---|---|---|
| 0.0 – 0.25 | ✅ Likely Factual | Passed as-is |
| 0.26 – 0.40 | ⚠️ Uncertain | Cross-model verification triggered |
| 0.41 – 1.0 | 🚩 High Risk | Flagged + RAG correction shown |

---

## 🚀 Quick Start

### Backend
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env        # fill in your API keys
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env.local  # fill in your keys
npm run dev
```

Frontend → `http://localhost:3000`
Backend → `http://localhost:8000`

---

## 📂 Project Structure

```
hallucination-firewall/
├── backend/
│   ├── app/
│   │   ├── main.py               ← FastAPI entry point
│   │   ├── routes/chat.py        ← Pipeline logic + SSE endpoint
│   │   └── services/
│   │       ├── classifier.py     ← DistilBERT inference
│   │       ├── gpt_service.py    ← OpenAI calls
│   │       ├── gemini_service.py ← Groq calls
│   │       ├── rag_service.py    ← Wikipedia + Serper + News
│   │       └── supabase_service.py
│   └── model/train.py            ← Fine-tuning script
│
├── frontend/
│   ├── app/                      ← Pages (chat, auth, dashboard)
│   ├── components/                ← ChatWindow, Sidebar, etc.
│   └── lib/                       ← API client, Supabase client
│
└── supabase/schema.sql
```

---

## 📌 Notes & Limitations

- Scoring thresholds (e.g. the 0.31 floor) are hand-tuned, not statistically derived from a validation set — reasonable for a project this scope, but worth knowing.
- No automated test suite yet.
- RAG source ranking is straightforward (no re-ranking model).

---

*Built solo as a semester project by [Zain](https://github.com/zain-the-npc) — fine-tuned the model, built both ends of the stack, and deployed it end-to-end.* 🚀
