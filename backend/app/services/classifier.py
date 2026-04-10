import torch

import torch.nn.functional as F

from transformers import DistilBertTokenizerFast, DistilBertForSequenceClassification

from app.config import HALLUCINATION_THRESHOLD

import os
os.environ["TRANSFORMERS_CACHE"] = os.path.join(os.path.dirname(__file__), "../../model_cache")
os.environ["HF_HOME"]            = os.path.join(os.path.dirname(__file__), "../../model_cache")

HF_MODEL_ID = "zain-the-npc/hallucination-firewall"



print(f"Loading classifier from HuggingFace: {HF_MODEL_ID}")

tokenizer = DistilBertTokenizerFast.from_pretrained(HF_MODEL_ID)

model     = DistilBertForSequenceClassification.from_pretrained(HF_MODEL_ID)

model.eval()



TEMPERATURE = 1.2  # from your meta.json



device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

model.to(device)

print("Classifier loaded from HuggingFace.")

def is_factual_query(question: str) -> bool:
    conversational = {
        "hey", "hi", "hello", "thanks", "thank you", "ok", "okay",
        "sure", "got it", "bye", "lol", "haha", "yes", "no", "good",
        "great", "nice", "cool", "wow", "oh", "ah", "hmm", "alright",
        "welcome", "please", "sorry", "excuse me", "what", "sup"
    }
    q     = question.lower().strip().rstrip("?!.")
    words = q.split()

    if q in conversational:
        return False
    if len(words) == 1:
        return False
    if len(words) <= 3 and all(w in conversational for w in words):
        return False

    question_indicators = [
        "what", "who", "when", "where", "why", "how", "which",
        "is", "are", "was", "were", "did", "does", "do", "can",
        "could", "tell", "explain", "define", "describe", "list",
        "name", "give", "show", "find", "calculate", "solve"
    ]

    if any(w in words for w in question_indicators):
        return True
    if len(words) >= 5:
        return True

    return False



def classify(question: str, answer: str) -> dict:

    input_text = f"Question: {question} Answer: {answer}"



    inputs = tokenizer(

        input_text,

        return_tensors="pt",

        truncation=True,

        max_length=256,

        padding="max_length"

    ).to(device)



    with torch.no_grad():

        outputs = model(**inputs)

        scaled  = outputs.logits / TEMPERATURE

        probs   = F.softmax(scaled, dim=1)



    hallucination_score = round(probs[0][1].item(), 4)

    factual_score       = round(probs[0][0].item(), 4)

    is_hallucination    = hallucination_score >= HALLUCINATION_THRESHOLD



    if hallucination_score >= 0.8:

        confidence_label = "HIGH RISK"

    elif hallucination_score >= 0.6:

        confidence_label = "MEDIUM RISK"

    elif hallucination_score >= 0.4:

        confidence_label = "LOW RISK"

    else:

        confidence_label = "LIKELY FACTUAL"



    return {

        "hallucination_score": hallucination_score,

        "factual_score":       factual_score,

        "is_hallucination":    is_hallucination,

        "confidence_label":    confidence_label,

        "threshold_used":      HALLUCINATION_THRESHOLD

    }

