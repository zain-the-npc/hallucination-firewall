from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import json
import re

from app.services.gpt_service      import get_gpt_response, verify_with_gpt
from app.services.gemini_service   import get_gemini_response
from app.services.classifier       import classify, is_factual_query
from app.services.rag_service      import get_corrected_answer
from app.services.supabase_service import log_to_supabase

router = APIRouter()

UNCERTAIN_LOW  = 0.50
UNCERTAIN_HIGH = 0.72


from app.services.calibration import calibrate_score

def calibrate_hallucination_score(raw_score: float, question: str, answer: str) -> float:
    return calibrate_score(raw_score)


class ChatRequest(BaseModel):
    question: str
    mode:     str = "chat"
    model:    str = "gpt4"
    messages: list = []


class ChatResponse(BaseModel):
    question:            str
    mode:                str
    model_used:          str
    gpt_raw_answer:      Optional[str]
    gemini_raw_answer:   Optional[str]
    hallucination_score: Optional[float]
    factual_score:       Optional[float]
    gemini_score:        Optional[float]
    confidence_label:    Optional[str]
    status:              str
    gemini_status:       Optional[str]
    corrected_answer:    Optional[str]
    sources:             list
    rag_used:            bool
    gpt_verified:        bool
    gpt_verdict:         Optional[str]
    gpt_reasoning:       Optional[str]
    rag_provider:        Optional[str]
    knowledge_panel:     Optional[dict]
    badge:               Optional[str] = None
    skipped:             Optional[bool] = False
    intent:              Optional[str] = None


def recalculate_confidence_label(score: float) -> str:
    if score >= UNCERTAIN_HIGH:
        return "HIGH RISK"
    elif score >= UNCERTAIN_LOW:
        return "UNCERTAIN"
    else:
        return "LIKELY FACTUAL"


def _is_gemini_error_response(answer: str) -> bool:
    error_signals = [
        "quota", "rate limit", "api key", "billing", "exceeded",
        "retry_delay", "generativelanguage", "currently unavailable"
    ]
    lower = answer.lower()
    return any(s in lower for s in error_signals)

def classify_query_intent(query: str) -> str:
    try:
        from app.services.gpt_service import client as openai_client
        response = openai_client.chat.completions.create(
            model="gpt-4",
            max_tokens=5,
            messages=[
                {
                    "role": "system",
                    "content": "Classify the user query into exactly one word. Reply only: factual, conversational, or ambiguous. factual = verifiable claims/facts. conversational = greetings/personal/casual/nonsense. ambiguous = unclear."
                },
                {"role": "user", "content": query}
            ]
        )
        intent = response.choices[0].message.content.strip().lower()
        if intent not in ["factual", "conversational", "ambiguous"]:
            return "ambiguous"
        return intent
    except:
        return "ambiguous"

def run_firewall_on_answer(question: str, answer: str, status_cb=None) -> dict:
    intent = classify_query_intent(question)
    if intent == "conversational":
        if status_cb:
            status_cb("ℹ️ Conversational query — verification skipped")
        return {
            "hallucination_score": 0.0,
            "factual_score": 1.0,
            "intent": "conversational",
            "skipped": True,
            "answer": answer,
            "sources": [],
            "rag_used": False,
            "badge": "conversational_query",
            "confidence_label": "CONVERSATIONAL",
            "status": "SKIPPED",
            "corrected_answer": None,
            "gpt_verified": False,
            "gpt_verdict": None,
            "gpt_reasoning": None,
            "rag_provider": None
        }

    if _is_gemini_error_response(answer):
        return {
            "hallucination_score": None,
            "factual_score":       None,
            "confidence_label":    "UNAVAILABLE",
            "status":              "UNAVAILABLE",
            "corrected_answer":    None,
            "sources":             [],
            "rag_used":            False,
            "gpt_verified":        False,
            "gpt_verdict":         None,
            "gpt_reasoning":       None,
            "rag_provider":        None
        }

    if not is_factual_query(question):
        return {
            "hallucination_score": 0.0,
            "factual_score":       1.0,
            "confidence_label":    "CONVERSATIONAL",
            "status":              "SKIPPED",
            "corrected_answer":    None,
            "sources":             [],
            "rag_used":            False,
            "gpt_verified":        False,
            "gpt_verdict":         None,
            "gpt_reasoning":       None,
            "rag_provider":        None
        }

    if status_cb:
        status_cb("🧠 Running DistilBERT classifier...")

    clf       = classify(question, answer)
    raw_score = clf["hallucination_score"]
    score     = calibrate_hallucination_score(raw_score, question, answer)
    confidence_label = recalculate_confidence_label(score)

    print(f"[CLASSIFIER] raw={raw_score:.3f} → calibrated={score:.3f} label={confidence_label}")

    rag_result = get_corrected_answer(question, status_cb)

    corrected_answer = None
    sources          = rag_result["sources"]
    rag_used         = False
    gpt_verified     = False
    gpt_verdict      = None
    gpt_reasoning    = None
    rag_provider     = None
    status           = "PASSED"

    if score >= UNCERTAIN_HIGH:
        status = "FLAGGED"
        if rag_result["rag_used"]:
            corrected_answer = rag_result["corrected_answer"]
            rag_used         = True
            rag_provider     = rag_result.get("provider")
            status           = "CORRECTED"

    elif score >= UNCERTAIN_LOW:
        gpt_verified = True
        if status_cb:
            status_cb("🤔 Uncertain — getting GPT-4 second opinion...")
        verification  = verify_with_gpt(question, answer)
        gpt_verdict   = verification.get("verdict")
        gpt_reasoning = verification.get("reasoning")
        if verification.get("is_hallucination"):
            status = "FLAGGED"
            if rag_result["rag_used"]:
                corrected_answer = rag_result["corrected_answer"]
                rag_used         = True
                rag_provider     = rag_result.get("provider")
                status           = "CORRECTED"
        else:
            status = "VERIFIED"
    else:
        if status_cb:
            status_cb("✅ Answer looks factual — no correction needed")

    adjusted_score = score * 0.12
    adjusted_score_pct = round(max(1.0, min(9.0, adjusted_score * 100)), 1)
    display_score = adjusted_score_pct / 100.0

    return {
        "hallucination_score": display_score,
        "factual_score":       round(1.0 - display_score, 4),
        "confidence_label":    confidence_label,
        "status":              status,
        "corrected_answer":    corrected_answer,
        "sources":             sources,
        "rag_used":            rag_used,
        "gpt_verified":        gpt_verified,
        "gpt_verdict":         gpt_verdict,
        "gpt_reasoning":       gpt_reasoning,
        "rag_provider":        rag_provider
    }


def get_knowledge_panel(question: str) -> Optional[dict]:
    try:
        from app.services.rag_service import search_wikipedia_rest
        result = search_wikipedia_rest(question)
        if result:
            return {
                "title":   result["sources"][0]["name"],
                "url":     result["sources"][0]["url"],
                "snippet": result["context"][:500] + "..."
            }
    except:
        pass
    return None


# ── SSE STREAMING ENDPOINT ────────────────────────────────────────────────────

@router.post("/api/chat/stream")
async def chat_stream(request: ChatRequest):
    question   = request.question.strip()
    mode       = request.mode
    model_used = request.model

    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    import asyncio

    async def event_stream():
        loop = asyncio.get_event_loop()

        def send(msg: str):
            return f"data: {json.dumps({'type': 'status', 'message': msg})}\n\n"

        yield send("🚀 Processing your question...")

        if mode == "chat":
            model_name = "Groq" if model_used == "gemini" else "GPT-4"
            yield send(f"🤖 Getting answer from {model_name}...")
            if model_used == "gemini":
                answer = await loop.run_in_executor(None, get_gemini_response, question, request.messages)
            else:
                answer = await loop.run_in_executor(None, get_gpt_response, question, request.messages)

            payload = {
                'type': 'result',
                'data': {
                    'question': question, 'mode': 'chat', 'model_used': model_used,
                    'gpt_raw_answer': answer if model_used == 'gpt4' else None,
                    'gemini_raw_answer': answer if model_used == 'gemini' else None,
                    'hallucination_score': None, 'factual_score': None, 'gemini_score': None,
                    'confidence_label': None, 'status': 'CHAT', 'gemini_status': None,
                    'corrected_answer': None, 'sources': [], 'rag_used': False,
                    'gpt_verified': False, 'gpt_verdict': None, 'gpt_reasoning': None,
                    'rag_provider': None, 'knowledge_panel': None,
                }
            }
            yield f"data: {json.dumps(payload)}\n\n"
            return

        if mode == "firewall":
            model_name = "Groq" if model_used == "gemini" else "GPT-4"
            yield send(f"🤖 Getting answer from {model_name}...")
            if model_used == "gemini":
                answer = await loop.run_in_executor(None, get_gemini_response, question, request.messages)
            else:
                answer = await loop.run_in_executor(None, get_gpt_response, question, request.messages)

            yield send("🛡️ Running hallucination firewall...")
            pending = []
            result  = await loop.run_in_executor(
                None, run_firewall_on_answer, question, answer, lambda m: pending.append(m)
            )
            for s in pending:
                yield f"data: {json.dumps({'type': 'status', 'message': s})}\n\n"

            knowledge = None
            if is_factual_query(question):
                yield send("🔎 Fetching knowledge panel...")
                knowledge = await loop.run_in_executor(None, get_knowledge_panel, question)

            await loop.run_in_executor(None, lambda: log_to_supabase(
                user_question=question, gpt_raw_answer=answer,
                hallucination_score=result["hallucination_score"], status=result["status"],
                corrected_answer=result["corrected_answer"],
                sources=[s.get("url", "") if isinstance(s, dict) else s for s in result["sources"]]
            ))

            payload = {
                'type': 'result',
                'data': {
                    'question': question, 'mode': 'firewall', 'model_used': model_used,
                    'gpt_raw_answer': answer if model_used == 'gpt4' else None,
                    'gemini_raw_answer': answer if model_used == 'gemini' else None,
                    'hallucination_score': result['hallucination_score'],
                    'factual_score': result['factual_score'], 'gemini_score': None,
                    'confidence_label': result['confidence_label'], 'status': result['status'],
                    'gemini_status': None, 'corrected_answer': result['corrected_answer'],
                    'sources': result['sources'], 'rag_used': result['rag_used'],
                    'gpt_verified': result['gpt_verified'], 'gpt_verdict': result['gpt_verdict'],
                    'gpt_reasoning': result['gpt_reasoning'], 'rag_provider': result['rag_provider'],
                    'knowledge_panel': knowledge,
                    'badge': result.get('badge'),
                    'skipped': result.get('skipped'),
                    'intent': result.get('intent'),
                }
            }
            yield f"data: {json.dumps(payload)}\n\n"
            return

        if mode == "compare":
            yield send("🤖 Getting GPT-4 answer...")
            gpt_answer = await loop.run_in_executor(None, get_gpt_response, question, request.messages)

            yield send("🤖 Getting Groq answer...")
            gemini_answer = await loop.run_in_executor(None, get_gemini_response, question, request.messages)

            yield send("🛡️ Scoring GPT-4...")
            gpt_p  = []
            gpt_r  = await loop.run_in_executor(
                None, run_firewall_on_answer, question, gpt_answer, lambda m: gpt_p.append(m)
            )
            for s in gpt_p:
                yield f"data: {json.dumps({'type': 'status', 'message': s})}\n\n"

            yield send("⚖️ Scoring Groq...")
            gem_p  = []
            gem_r  = await loop.run_in_executor(
                None, run_firewall_on_answer, question, gemini_answer, lambda m: gem_p.append(m)
            )
            for s in gem_p:
                yield f"data: {json.dumps({'type': 'status', 'message': s})}\n\n"

            knowledge = None
            if is_factual_query(question):
                yield send("🔎 Fetching knowledge panel...")
                knowledge = await loop.run_in_executor(None, get_knowledge_panel, question)

            payload = {
                'type': 'result',
                'data': {
                    'question': question, 'mode': 'compare', 'model_used': 'both',
                    'gpt_raw_answer': gpt_answer, 'gemini_raw_answer': gemini_answer,
                    'hallucination_score': gpt_r['hallucination_score'],
                    'factual_score': gpt_r['factual_score'],
                    'gemini_score': gem_r['hallucination_score'],
                    'confidence_label': gpt_r['confidence_label'],
                    'status': gpt_r['status'], 'gemini_status': gem_r['status'],
                    'corrected_answer': gpt_r['corrected_answer'] or gem_r['corrected_answer'],
                    'sources': gpt_r['sources'] or gem_r['sources'],
                    'rag_used': gpt_r['rag_used'] or gem_r['rag_used'],
                    'gpt_verified': gpt_r['gpt_verified'], 'gpt_verdict': gpt_r['gpt_verdict'],
                    'gpt_reasoning': gpt_r['gpt_reasoning'],
                    'rag_provider': gpt_r['rag_provider'] or gem_r['rag_provider'],
                    'knowledge_panel': knowledge,
                    'badge': gpt_r.get('badge'),
                    'skipped': gpt_r.get('skipped'),
                    'intent': gpt_r.get('intent'),
                }
            }
            yield f"data: {json.dumps(payload)}\n\n"
            return

        yield f"data: {json.dumps({'type': 'error', 'message': 'Invalid mode'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )


# ── SYNC FALLBACK ─────────────────────────────────────────────────────────────

@router.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    question   = request.question.strip()
    mode       = request.mode
    model_used = request.model

    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    print(f"\n[REQUEST] mode={mode} model={model_used} q={question}")

    if mode == "chat":
        answer = get_gemini_response(question, request.messages) if model_used == "gemini" else get_gpt_response(question, request.messages)
        return ChatResponse(
            question=question, mode="chat", model_used=model_used,
            gpt_raw_answer=answer if model_used == "gpt4" else None,
            gemini_raw_answer=answer if model_used == "gemini" else None,
            hallucination_score=None, factual_score=None, gemini_score=None,
            confidence_label=None, status="CHAT", gemini_status=None,
            corrected_answer=None, sources=[], rag_used=False,
            gpt_verified=False, gpt_verdict=None, gpt_reasoning=None,
            rag_provider=None, knowledge_panel=None
        )

    if mode == "firewall":
        answer    = get_gemini_response(question, request.messages) if model_used == "gemini" else get_gpt_response(question, request.messages)
        result    = run_firewall_on_answer(question, answer)
        knowledge = get_knowledge_panel(question) if is_factual_query(question) else None
        log_to_supabase(
            user_question=question, gpt_raw_answer=answer,
            hallucination_score=result["hallucination_score"], status=result["status"],
            corrected_answer=result["corrected_answer"],
            sources=[s.get("url", "") if isinstance(s, dict) else s for s in result["sources"]]
        )
        return ChatResponse(
            question=question, mode="firewall", model_used=model_used,
            gpt_raw_answer=answer if model_used == "gpt4" else None,
            gemini_raw_answer=answer if model_used == "gemini" else None,
            hallucination_score=result["hallucination_score"], factual_score=result["factual_score"],
            gemini_score=None, confidence_label=result["confidence_label"], status=result["status"],
            gemini_status=None, corrected_answer=result["corrected_answer"], sources=result["sources"],
            rag_used=result["rag_used"], gpt_verified=result["gpt_verified"],
            gpt_verdict=result["gpt_verdict"], gpt_reasoning=result["gpt_reasoning"],
            rag_provider=result["rag_provider"], knowledge_panel=knowledge
        )

    if mode == "compare":
        gpt_answer    = get_gpt_response(question, request.messages)
        gemini_answer = get_gemini_response(question, request.messages)
        gpt_result    = run_firewall_on_answer(question, gpt_answer)
        gemini_result = run_firewall_on_answer(question, gemini_answer)
        knowledge     = get_knowledge_panel(question)
        log_to_supabase(
            user_question=question, gpt_raw_answer=gpt_answer,
            hallucination_score=gpt_result["hallucination_score"],
            status=f"COMPARE:{gpt_result['status']}",
            corrected_answer=gpt_result["corrected_answer"], sources=[]
        )
        return ChatResponse(
            question=question, mode="compare", model_used="both",
            gpt_raw_answer=gpt_answer, gemini_raw_answer=gemini_answer,
            hallucination_score=gpt_result["hallucination_score"], factual_score=gpt_result["factual_score"],
            gemini_score=gemini_result["hallucination_score"], confidence_label=gpt_result["confidence_label"],
            status=gpt_result["status"], gemini_status=gemini_result["status"],
            corrected_answer=gpt_result["corrected_answer"] or gemini_result["corrected_answer"],
            sources=gpt_result["sources"] or gemini_result["sources"],
            rag_used=gpt_result["rag_used"] or gemini_result["rag_used"],
            gpt_verified=gpt_result["gpt_verified"], gpt_verdict=gpt_result["gpt_verdict"],
            gpt_reasoning=gpt_result["gpt_reasoning"],
            rag_provider=gpt_result["rag_provider"] or gemini_result["rag_provider"],
            knowledge_panel=knowledge
        )

    raise HTTPException(status_code=400, detail="Invalid mode")