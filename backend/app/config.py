from dotenv import load_dotenv
import os

load_dotenv()

OPENAI_API_KEY        = os.getenv("OPENAI_API_KEY")
SUPABASE_URL          = os.getenv("SUPABASE_URL")
SUPABASE_KEY          = os.getenv("SUPABASE_KEY")
MODEL_PATH            = os.getenv("MODEL_PATH", "app/model/saved_model")
HALLUCINATION_THRESHOLD = float(os.getenv("HALLUCINATION_THRESHOLD", 0.6))