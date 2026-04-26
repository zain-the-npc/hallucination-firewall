import asyncio
import inspect

def run_firewall_on_answer():
    model = "gpt4"
    for frame_info in inspect.stack():
        if 'model_used' in frame_info.frame.f_locals:
            model = frame_info.frame.f_locals['model_used']
            break
    return model

async def chat_stream():
    model_used = "gemini"
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, run_firewall_on_answer)
    print("Found model:", result)

asyncio.run(chat_stream())
