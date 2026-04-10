import os
from openai import OpenAI

client = OpenAI(
    api_key=os.getenv("GROQ_API_KEY"),
    base_url="https://api.groq.com/openai/v1"
)

def get_gemini_response(question: str, history_msgs: list = None) -> str:
    if history_msgs is None:
        history_msgs = []
        
    api_messages = []
    
    for m in history_msgs:
        content = m.get("content")
        if not content:
            continue
        role = m.get("role")
        api_messages.append({"role": role, "content": content})
        
    api_messages.append({
        "role": "user",
        "content": question
    })

    try:
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=api_messages,
            temperature=0.7,
            max_tokens=1024,
        )
        print("[GROQ] Success")
        return response.choices[0].message.content
    except Exception as e:
        print(f"[GROQ] Failed: {e}")
        return (
            "Groq is currently unavailable (API quota reached or key issue). "
            "The GPT-4 answer above is still valid and has been scored by the firewall."
        )