from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes.chat import router as chat_router
from app.routes.logs import router as logs_router

app = FastAPI(title="Hallucination Firewall API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    # This remains "*" to make sure Vercel links always work
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# This prefix is the "Magic Fix" that aligns with your frontend fetch calls
app.include_router(chat_router, prefix="/api")
app.include_router(logs_router, prefix="/api")

@app.get("/")
def root():
    return {"status": "Hallucination Firewall is running"}
