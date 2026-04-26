from transformers import pipeline
pipe = pipeline("text-classification", 
                model="zain-the-npc/hallucination-firewall",
                return_all_scores=True)

tests = [
    ("What is 2+2?", "4"),
    ("Who wrote Harry Potter?", "J.K. Rowling"),
    ("Who wrote Harry Potter?", "Stephen King"),
    ("When did WW2 end?", "1945"),
    ("When did WW2 end?", "1952"),
    ("Is the sky blue?", "Yes the sky appears blue"),
    ("Is the sky blue?", "No the sky is green"),
]

for q, a in tests:
    result = pipe(f"Question: {q} Answer: {a}")
    hall_score = result[0][1]['score']  # HALLUCINATION score
    print(f"Score: {hall_score:.3f} | Q: {q} | A: {a}")