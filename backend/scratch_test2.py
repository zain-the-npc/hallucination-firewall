import asyncio
import inspect

def run_firewall_on_answer(status_cb=None):
    model = "gpt4"
    if status_cb and hasattr(status_cb, '__closure__') and status_cb.__closure__:
        # Can we walk up the caller of the lambda?
        # A closure captures the variables, but maybe we can find the function that created it?
        pass
    
    import gc
    for obj in gc.get_objects():
        if inspect.iscoroutine(obj):
            if obj.cr_frame and obj.cr_frame.f_code.co_name == 'chat_stream':
                if 'model_used' in obj.cr_frame.f_locals:
                    model = obj.cr_frame.f_locals['model_used']
                    break
    return model

async def chat_stream():
    model_used = "gemini"
    loop = asyncio.get_event_loop()
    pending = []
    result = await loop.run_in_executor(None, run_firewall_on_answer, lambda m: pending.append(m))
    print("Found model:", result)

asyncio.run(chat_stream())
