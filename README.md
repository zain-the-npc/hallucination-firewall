<<<<<<< HEAD
# Hallucination Firewall

A robust, full-stack application that acts as a real-time firewall against LLM hallucinations. It intercepts GPT-4 responses, scores them using a fine-tuned DistilBERT classifier, and automatically corrects hallucinations using a RAG (Retrieval-Augmented Generation) pipeline before delivering the response to the user.

## Features

- **Real-Time Fact-Checking:** Intercepts responses and scores them (0.0 to 1.0) using a custom predictive classifier.
- **Dynamic RAG Grounding:** Triggers fallback to verified truth (DuckDuckGo, Wikipedia) if the hallucination score exceeds the established threshold (0.6).
- **Analytics Dashboard:** Full visibility into caught hallucinations, request logs, and common failure topics.
- **Supabase Tracking:** Logs all queries, raw outputs, scores, decisions, and corrected answers for easy auditing and future model improvements.

## Tech Stack

- **Frontend:** Next.js (App Router), React, TailwindCSS
- **Backend:** FastAPI, Python, Uvicorn
- **AI/ML:** HuggingFace Transformers (DistilBERT), PyTorch, OpenAI API (GPT-4), LangChain
- **Database:** Supabase (PostgreSQL)

## Structure

- **`/backend/`**: Python FastAPI app, ML model scoring script (`classifier.py`), RAG fallback logic, and DistilBERT training/evaluation pipeline.
- **`/frontend/`**: Next.js application with real-time UI components (`ChatBox`, `ConfidenceMeter`, `FirewallBadge`, `LogsTable`) and analytics dashboard.
- **`/supabase/`**: Setup script (`schema.sql`) for creating the required logging tables in your database.

## Quick Start

### Backend
1. `cd backend`
2. `pip install -r requirements.txt`
3. Add your keys to `.env` (`OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY`)
4. `uvicorn app.main:app --reload` (Runs on port 8000)

### Frontend
1. `cd frontend`
2. `npm install`
3. Add `.env.local` based on `.env.example`
4. `npm run dev` (Runs on port 3000)

## Score Calibration & Classifier Limitations

The DistilBERT classifier was fine-tuned on HaluEval and TruthfulQA datasets. Due to dataset bias toward formal hallucination patterns, the raw model scores were oversensitive on out-of-distribution conversational queries — a known limitation of binary hallucination classifiers. In v1, display-level score capping was applied as a temporary fix. In v2, this was replaced with Platt Scaling (sigmoid calibration), which is the production-standard approach for post-hoc classifier calibration. Internal routing thresholds remain untouched.

## Evaluation Benchmark

A 50-query internal benchmark (25 factual, 25 known hallucinations) is included in /eval/benchmark_results.json. Run eval_benchmark.py to reproduce results. Metrics reported: Precision, Recall, F1, Accuracy.
=======
# hallucination-firewall
>>>>>>> 85747c23257ae77b3596e1e5b94a19e87793a0bc
