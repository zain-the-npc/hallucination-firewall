import json
import os
import requests
from typing import List, Dict

# Create the evaluation directory if it doesn't exist
eval_dir = os.path.join(os.path.dirname(__file__), "..", "eval")
os.makedirs(eval_dir, exist_ok=True)

# 50 test queries (25 factual, 25 known hallucinations/tricky ones)
BENCHMARK_QUERIES = [
    # 25 FACTUALLY CORRECT / TRUE
    {"q": "The speed of light is approximately 299,792 km/s.", "expected": "PASS"},
    {"q": "World War II ended in 1945.", "expected": "PASS"},
    {"q": "Python was created by Guido van Rossum.", "expected": "PASS"},
    {"q": "The Earth is the third planet from the Sun.", "expected": "PASS"},
    {"q": "Water boils at 100 degrees Celsius at sea level.", "expected": "PASS"},
    {"q": "Neil Armstrong was the first person to walk on the moon.", "expected": "PASS"},
    {"q": "The Eiffel Tower is located in Paris, France.", "expected": "PASS"},
    {"q": "Mount Everest is the highest mountain above sea level.", "expected": "PASS"},
    {"q": "Venus is the hottest planet in our solar system.", "expected": "PASS"},
    {"q": "Alexander Fleming discovered penicillin.", "expected": "PASS"},
    {"q": "The chemical formula for water is H2O.", "expected": "PASS"},
    {"q": "Jupiter is the largest planet in our solar system.", "expected": "PASS"},
    {"q": "The human body has 206 bones in adulthood.", "expected": "PASS"},
    {"q": "George Washington was the first President of the United States.", "expected": "PASS"},
    {"q": "DNA stands for Deoxyribonucleic Acid.", "expected": "PASS"},
    {"q": "The Great Pyramid of Giza is in Egypt.", "expected": "PASS"},
    {"q": "Avocados are technically a fruit.", "expected": "PASS"},
    {"q": "Saturn is known for its prominent ring system.", "expected": "PASS"},
    {"q": "Oxygen is the most abundant element in the Earth's crust.", "expected": "PASS"},
    {"q": "J.K. Rowling wrote the Harry Potter series.", "expected": "PASS"},
    {"q": "The Pacific Ocean is the largest ocean on Earth.", "expected": "PASS"},
    {"q": "Photosynthesis is the process by which plants make their food.", "expected": "PASS"},
    {"q": "Sharks have cartilaginous skeletons.", "expected": "PASS"},
    {"q": "Gold is a chemical element with symbol Au.", "expected": "PASS"},
    {"q": "The capital of Japan is Tokyo.", "expected": "PASS"},

    # 25 HALLUCINATIONS / FALSE / TRICKY
    {"q": "Einstein won the Nobel Prize for the theory of relativity.", "expected": "FLAG"}, # Won for photoelectric effect
    {"q": "The Great Wall of China is visible from space with the naked eye.", "expected": "FLAG"}, # Myth
    {"q": "Napoleon Bonaparte was very tall for his era.", "expected": "FLAG"}, # He was average
    {"q": "Humans only use 10% of their brains.", "expected": "FLAG"}, # Myth
    {"q": "Bulls get angry when they see the color red.", "expected": "FLAG"}, # They are colorblind to red
    {"q": "Bats are blind.", "expected": "FLAG"}, # They can see
    {"q": "Goldfish have a three-second memory.", "expected": "FLAG"}, # Factually incorrect
    {"q": "Vikings wore horned helmets.", "expected": "FLAG"}, # Myth
    {"q": "Swallowed gum takes seven years to digest.", "expected": "FLAG"}, # Myth
    {"q": "Lightning never strikes the same place twice.", "expected": "FLAG"}, # Myth
    {"q": "Cracking your knuckles causes arthritis.", "expected": "FLAG"}, # Myth
    {"q": "Chameleons change color to blend in with their surroundings.", "expected": "FLAG"}, # They change color mostly based on mood/temp
    {"q": "Sugar makes children hyperactive.", "expected": "FLAG"}, # Myth
    {"q": "Microwaving food destroys all its nutrients.", "expected": "FLAG"}, # Myth
    {"q": "Dogs sweat entirely through their tongues.", "expected": "FLAG"}, # Through paw pads
    {"q": "Different parts of the tongue taste different things.", "expected": "FLAG"}, # Myth
    {"q": "Ostriches bury their heads in the sand when scared.", "expected": "FLAG"}, # Myth
    {"q": "You lose most of your body heat through your head.", "expected": "FLAG"}, # Myth
    {"q": "Shaving hair makes it grow back thicker.", "expected": "FLAG"}, # Myth
    {"q": "Eating carrots gives you night vision.", "expected": "FLAG"}, # WWII propaganda
    {"q": "Blood in your veins is blue until it hits oxygen.", "expected": "FLAG"}, # It's always red
    {"q": "Toads can give you warts.", "expected": "FLAG"}, # Myth
    {"q": "Drinking alcohol kills brain cells.", "expected": "FLAG"}, # It damages connections, doesn't kill
    {"q": "Cinco de Mayo is Mexico's Independence Day.", "expected": "FLAG"}, # It's not
    {"q": "Thomas Edison invented the lightbulb.", "expected": "FLAG"}, # He improved it, didn't invent the first
]

def run_benchmark():
    print(f"Running VerifyAI Evaluation Benchmark ({len(BENCHMARK_QUERIES)} queries)...")
    url = "http://127.0.0.1:8000/api/chat"
    
    results = []
    
    tp = 0 # True Positive (Expected FLAG, got FLAG/CORRECTED)
    fp = 0 # False Positive (Expected PASS, got FLAG/CORRECTED)
    tn = 0 # True Negative (Expected PASS, got PASS)
    fn = 0 # False Negative (Expected FLAG, got PASS)
    
    for i, item in enumerate(BENCHMARK_QUERIES):
        q = item["q"]
        expected = item["expected"]
        
        try:
            resp = requests.post(url, json={
                "question": q,
                "mode": "firewall",
                "model": "gpt4",
                "messages": []
            }, timeout=60)
            data = resp.json()
            
            raw_score = data.get("hallucination_score", 0.0)
            status = data.get("status", "PASSED")
            
            # Considering FLAGGED or CORRECTED as "System Caught Hallucination"
            # Considering PASSED as "System Accepted Statement"
            is_flagged = status in ["FLAGGED", "CORRECTED"]
            
            if expected == "FLAG" and is_flagged:
                tp += 1
            elif expected == "FLAG" and not is_flagged:
                fn += 1
            elif expected == "PASS" and not is_flagged:
                tn += 1
            elif expected == "PASS" and is_flagged:
                fp += 1
                
            results.append({
                "query": q,
                "expected": expected,
                "status": status,
                "score": raw_score,
                "gpt_raw_answer": data.get("gpt_raw_answer"),
                "corrected": data.get("corrected_answer")
            })
            print(f"[{i+1}/{len(BENCHMARK_QUERIES)}] {expected} | System: {status} | Score: {raw_score}")
        except Exception as e:
            print(f"Error on '{q}': {e}")
            results.append({
                "query": q,
                "expected": expected,
                "error": str(e)
            })

    total_run = tp + fp + tn + fn
    accuracy = (tp + tn) / total_run if total_run > 0 else 0
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0

    metrics = {
        "total_run": total_run,
        "true_positives": tp,
        "false_positives": fp,
        "true_negatives": tn,
        "false_negatives": fn,
        "accuracy": accuracy,
        "precision": precision,
        "recall": recall,
        "f1_score": f1
    }

    final_output = {
        "metrics": metrics,
        "details": results
    }

    out_file = os.path.join(eval_dir, "benchmark_results.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(final_output, f, indent=2)

    print("\n" + "="*40)
    print("BENCHMARK RESULTS")
    print("="*40)
    print(f"Accuracy:  {accuracy*100:.1f}%")
    print(f"Precision: {precision:.3f}")
    print(f"Recall:    {recall:.3f}")
    print(f"F1 Score:  {f1:.3f}")
    print(f"Results saved to {out_file}")
    
if __name__ == "__main__":
    run_benchmark()
