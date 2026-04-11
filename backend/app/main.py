from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes.chat import router as chat_router
from app.routes.logs import router as logs_router

app = FastAPI(title="Hallucination Firewall API", version="1.0.0")

# 1. THE CORS GATE: Opening it wide for all Vercel links
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# 2. THE PATH ALIGNMENT: Matching your api.ts calls
app.include_router(chat_router, prefix="/api")
app.include_router(logs_router, prefix="/api")

@app.get("/")
def root():
    return {"status": "Hallucination Firewall is running"}

# 3. THE API PROOF: A quick check to verify the prefix works
@app.get("/api")
def api_root():
    return {"message": "API route is active and reaching the backend"}
