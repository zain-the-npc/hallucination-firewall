from supabase import create_client
from app.config import SUPABASE_URL, SUPABASE_KEY
from datetime import datetime

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def log_to_supabase(
    user_question: str,
    gpt_raw_answer: str,
    hallucination_score: float,
    status: str,                    # PASSED | FLAGGED | CORRECTED
    corrected_answer: str = None,
    sources: list = [],
    model_version: str = "distilbert-halueval-v1"
):
    try:
        data = {
            "user_question":      user_question,
            "gpt_raw_answer":     gpt_raw_answer,
            "hallucination_score": round(hallucination_score, 4),
            "status":             status,
            "corrected_answer":   corrected_answer,
            "sources":            sources,
            "model_version":      model_version,
            "created_at":         datetime.utcnow().isoformat()
        }

        result = supabase.table("hallucination_logs").insert(data).execute()
        return result

    except Exception as e:
        print(f"Supabase logging error: {e}")
        return None


def get_logs(limit: int = 50):
    try:
        result = (
            supabase.table("hallucination_logs")
            .select("*")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data
    except Exception as e:
        print(f"Supabase fetch error: {e}")
        return []


def get_stats():
    try:
        all_logs = (
            supabase.table("hallucination_logs")
            .select("status, hallucination_score")
            .execute()
        ).data

        total      = len(all_logs)
        flagged    = len([l for l in all_logs if l["status"] == "FLAGGED"])
        corrected  = len([l for l in all_logs if l["status"] == "CORRECTED"])
        passed     = len([l for l in all_logs if l["status"] == "PASSED"])
        avg_score  = (
            round(sum(l["hallucination_score"] for l in all_logs) / total, 4)
            if total > 0 else 0
        )

        return {
            "total":     total,
            "passed":    passed,
            "flagged":   flagged,
            "corrected": corrected,
            "avg_hallucination_score": avg_score
        }

    except Exception as e:
        print(f"Stats error: {e}")
        return {}