from fastapi import APIRouter
from app.services.supabase_service import get_logs, get_stats

router = APIRouter()


@router.get("/api/logs")
def fetch_logs(limit: int = 50):
    logs = get_logs(limit=limit)
    return {"logs": logs, "count": len(logs)}


@router.get("/api/stats")
def fetch_stats():
    return get_stats()