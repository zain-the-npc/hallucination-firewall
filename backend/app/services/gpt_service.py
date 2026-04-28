import os
from openai import OpenAI
from app.config import OPENAI_API_KEY

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

def get_gpt_response(question: str, history: list = None) -> str:
    if history is None:
        history = []
        
    api_messages = [
        {
            "role": "system",
            "content": "You are a helpful assistant. Answer clearly and concisely."
        }
    ]
    
    for msg in history:
        if msg.get("content"):
            api_messages.append({"role": msg["role"], "content": msg["content"]})
            
    api_messages.append({
        "role": "user",
        "content": question
    })

    response = client.chat.completions.create(
        model="gpt-4",
        messages=api_messages,
        temperature=0.7,
        max_tokens=500
    )
    return response.choices[0].message.content


def get_grounded_response(question: str, context: str) -> str:
    response = client.chat.completions.create(
        model="gpt-4",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a factual assistant. "
                    "Use ONLY the provided context to answer. "
                    "If context doesn't help, say you don't know. "
                    "Never make up information."
                )
            },
            {
                "role": "user",
                "content": f"Context:\n{context}\n\nQuestion: {question}"
            }
        ],
        temperature=0.1,       # low temp = more factual
        max_tokens=500
    )
    return response.choices[0].message.content
def verify_with_gpt(question: str, answer: str) -> dict:
    import json
    response = client.chat.completions.create(
        model="gpt-4",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a fact-checking assistant. "
                    "Analyze if the given answer contains hallucinations or factual errors. "
                    "Respond in JSON format only with no extra text:\n"
                    "{\n"
                    '  "is_hallucination": true or false,\n'
                    '  "confidence": 0.0 to 1.0,\n'
                    '  "reasoning": "brief explanation",\n'
                    '  "verdict": "FACTUAL" or "HALLUCINATION"\n'
                    "}"
                )
            },
            {
                "role": "user",
                "content": f"Question: {question}\nAnswer: {answer}"
            }
        ],
        temperature=0.1,
        max_tokens=200
    )

    try:
        text  = response.choices[0].message.content
        clean = text.replace("```json", "").replace("```", "").strip()
        return json.loads(clean)
    except:
        return {
            "is_hallucination": False,
            "confidence":       0.5,
            "reasoning":        "Could not parse GPT verification",
            "verdict":          "UNCERTAIN"
        }