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

UNCERTAIN_LOW  = 0.26
UNCERTAIN_HIGH = 0.41





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
    winner:              Optional[str] = None
    winner_reason:       Optional[str] = None


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

def is_short_answer_query(question: str, answer: str) -> bool:
    answer = answer.strip()
    yes_no = answer.lower() in ["yes", "no", "yes it is", "no it is not", "yes it is blue", "no it is green"]
    short_math = len(answer.split()) <= 2 and any(c.isdigit() for c in answer)
    return yes_no or short_math

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

    if is_short_answer_query(question, answer):
        return {
            "hallucination_score": 0.05,
            "factual_score": 0.95,
            "confidence_label": "LIKELY FACTUAL",
            "status": "PASSED",
            "corrected_answer": None,
            "sources": [],
            "rag_used": False,
            "gpt_verified": False,
            "gpt_verdict": None,
            "gpt_reasoning": None,
            "rag_provider": None,
            "badge": "short_answer",
            "skipped": False,
            "intent": "factual"
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

    clf = classify(question, answer)
    score = clf["hallucination_score"]
    confidence_label = recalculate_confidence_label(score)

    print(f"[CLASSIFIER] score={score:.3f} label={confidence_label}")

    primary_model = "gpt4"
    import gc, inspect
    for obj in gc.get_objects():
        if inspect.iscoroutine(obj) and obj.cr_frame and obj.cr_frame.f_code.co_name in ('chat_stream', 'chat'):
            locs = obj.cr_frame.f_locals
            if locs.get('gpt_answer') == answer:
                primary_model = "gpt4"
                break
            if locs.get('gemini_answer') == answer:
                primary_model = "gemini"
                break
            if locs.get('model_used') in ('gpt4', 'gemini'):
                primary_model = locs.get('model_used')
                break

    # Always run RAG
    if status_cb:
        status_cb("🔍 Searching web sources...")
    rag_result = get_corrected_answer(question, status_cb)
    corrected_answer = rag_result.get("corrected_answer")
    sources = rag_result.get("sources", [])
    rag_used = rag_result.get("rag_used", False)
    rag_provider = rag_result.get("provider") if rag_used else None

    # Always run counter model cross-check
    if status_cb:
        status_cb("🤔 Getting second opinion from counter model...")
    if primary_model == "gpt4":
        from app.services.gemini_service import client as groq_client
        try:
            response = groq_client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[
                    {
                        "role": "system",
                        "content": "You are a fact-checking assistant. Analyze if the given answer contains hallucinations or factual errors. Respond in JSON format only:\n{\"is_hallucination\": true or false, \"confidence\": 0.0 to 1.0, \"reasoning\": \"brief explanation\", \"verdict\": \"FACTUAL\" or \"HALLUCINATION\"}"
                    },
                    {"role": "user", "content": f"Question: {question}\nAnswer: {answer}"}
                ],
                temperature=0.1,
                max_tokens=200
            )
            text = response.choices[0].message.content
            verification = json.loads(text.replace("```json", "").replace("```", "").strip())
        except:
            verification = {"is_hallucination": False, "confidence": 0.5, "reasoning": "Groq verification failed", "verdict": "UNCERTAIN"}
    else:
        verification = verify_with_gpt(question, answer)

    gpt_verified = True
    gpt_verdict = verification.get("verdict")
    gpt_reasoning = verification.get("reasoning")

    # Score determines label only
    if score >= UNCERTAIN_HIGH:
        status = "FLAGGED"
    elif score >= UNCERTAIN_LOW:
        if verification.get("is_hallucination"):
            status = "FLAGGED"
        else:
            status = "VERIFIED"
    else:
        status = "PASSED"

    return {
        "hallucination_score": round(score, 4),
        "factual_score": round(1.0 - score, 4),
        "confidence_label": confidence_label,
        "status": status,
        "corrected_answer": corrected_answer,
        "sources": sources,
        "rag_used": rag_used,
        "gpt_verified": gpt_verified,
        "gpt_verdict": gpt_verdict,
        "gpt_reasoning": gpt_reasoning,
        "rag_provider": rag_provider
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

            gpt_score = gpt_r["hallucination_score"]
            gem_score = gem_r["hallucination_score"]
            
            if gpt_score < gem_score:
                winner = "gpt4"
                winner_reason = f"GPT-4 scored lower hallucination risk ({round(gpt_score*100)}% vs {round(gem_score*100)}%)"
            elif gem_score < gpt_score:
                winner = "groq"
                winner_reason = f"Groq scored lower hallucination risk ({round(gem_score*100)}% vs {round(gpt_score*100)}%)"
            else:
                winner = "tie"
                winner_reason = "Both models scored equally"

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
                    'winner': winner,
                    'winner_reason': winner_reason,
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
        
        gpt_score = gpt_result["hallucination_score"]
        gem_score = gemini_result["hallucination_score"]
        
        if gpt_score < gem_score:
            winner = "gpt4"
            winner_reason = f"GPT-4 scored lower hallucination risk ({round(gpt_score*100)}% vs {round(gem_score*100)}%)"
        elif gem_score < gpt_score:
            winner = "groq"
            winner_reason = f"Groq scored lower hallucination risk ({round(gem_score*100)}% vs {round(gpt_score*100)}%)"
        else:
            winner = "tie"
            winner_reason = "Both models scored equally"
            
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
            knowledge_panel=knowledge,
            winner=winner,
            winner_reason=winner_reason
        )

    raise HTTPException(status_code=400, detail="Invalid mode")