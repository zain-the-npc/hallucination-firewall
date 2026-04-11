from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes.chat import router as chat_router
from app.routes.logs import router as logs_router

app = FastAPI(title="Hallucination Firewall API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    # This allows any Vercel preview or production link to connect
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

app.include_router(chat_router)
app.include_router(logs_router)

@app.get("/")
def root():
    return {"status": "Hallucination Firewall is running"}
