from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes.chat import router as chat_router
from app.routes.logs import router as logs_router

app = FastAPI(title="Hallucination Firewall API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://hallucination-firewall-vr8y-sage.vercel.app",
        "https://hallucination-firewall-vr8y-5aqom1gt9.vercel.app",
        "https://hallucination-firewall-vr8y-g3fnzalww.vercel.app",
        "https://hallucination-fir-git-25a908-zain-ul-abideens-projects-30542373.vercel.app",
        "https://hallucination-firewall-vr8y-luldtpsk6.vercel.app",
        "https://hallucination-firewall.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

app.include_router(chat_router)
app.include_router(logs_router)

@app.get("/")
def root():
    return {"status": "Hallucination Firewall is running"}