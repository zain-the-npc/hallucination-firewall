
import os
import numpy as np
import torch
from datasets import load_dataset
from transformers import (
    DistilBertTokenizerFast,
    DistilBertForSequenceClassification,
    TrainingArguments,
    Trainer,
    EarlyStoppingCallback
)
from sklearn.metrics import (
    accuracy_score,
    precision_recall_fscore_support,
    confusion_matrix
)
import json

# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────

MODEL_NAME = "distilbert-base-uncased"
SAVE_PATH = "./saved_model"
MAX_LENGTH = 512
BATCH_SIZE = 16
EPOCHS = 4
LEARNING_RATE = 2e-5
SEED = 42

torch.manual_seed(SEED)
np.random.seed(SEED)

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"\n Using device: {device}\n")


# ─────────────────────────────────────────────
# STEP 1 — LOAD DATASET
# ─────────────────────────────────────────────

print("Loading HaluEval dataset...")

# HaluEval has 3 subsets: qa, dialogue, summarization
# We use 'qa' — most straightforward for our task
raw_dataset = load_dataset("pminervini/HaluEval", "qa")

print(f"Dataset loaded: {raw_dataset}")
print(f"Sample entry:\n{raw_dataset['data'][0]}\n")


# ─────────────────────────────────────────────
# STEP 2 — PREPROCESS
# ─────────────────────────────────────────────

# HaluEval gives us:
# - question
# - right_answer     (factual)
# - hallucinated_answer (hallucination)
# We need to reshape this into labeled pairs

def build_labeled_dataset(dataset):
    texts = []
    labels = []

    for item in dataset["data"]:
        question = item.get("question", "")
        right = item.get("right_answer", "")
        hallucinated = item.get("hallucinated_answer", "")

        # Combine question + answer as input
        # Label 0 = factual, 1 = hallucination

        if right:
            texts.append(f"Question: {question} Answer: {right}")
            labels.append(0)

        if hallucinated:
            texts.append(f"Question: {question} Answer: {hallucinated}")
            labels.append(1)

    return texts, labels


print("Building labeled dataset...")
texts, labels = build_labeled_dataset(raw_dataset)

print(f"Total samples: {len(texts)}")
print(f"Factual samples: {labels.count(0)}")
print(f"Hallucination samples: {labels.count(1)}\n")

# Train / val / test split (80 / 10 / 10)
from sklearn.model_selection import train_test_split

train_texts, temp_texts, train_labels, temp_labels = train_test_split(
    texts, labels, test_size=0.2, random_state=SEED, stratify=labels
)

val_texts, test_texts, val_labels, test_labels = train_test_split(
    temp_texts, temp_labels, test_size=0.5, random_state=SEED, stratify=temp_labels
)

print(f"Train: {len(train_texts)} | Val: {len(val_texts)} | Test: {len(test_texts)}\n")


# ─────────────────────────────────────────────
# STEP 3 — TOKENIZE
# ─────────────────────────────────────────────

print("Loading tokenizer...")
tokenizer = DistilBertTokenizerFast.from_pretrained(MODEL_NAME)

def tokenize(texts):
    return tokenizer(
        texts,
        max_length=MAX_LENGTH,
        truncation=True,
        padding="max_length",
        return_tensors="pt"
    )

print("Tokenizing splits...")
train_encodings = tokenize(train_texts)
val_encodings   = tokenize(val_texts)
test_encodings  = tokenize(test_texts)


# ─────────────────────────────────────────────
# STEP 4 — PYTORCH DATASET CLASS
# ─────────────────────────────────────────────

class HallucinationDataset(torch.utils.data.Dataset):
    def __init__(self, encodings, labels):
        self.encodings = encodings
        self.labels    = labels

    def __len__(self):
        return len(self.labels)

    def __getitem__(self, idx):
        item = {
            key: val[idx] for key, val in self.encodings.items()
        }
        item["labels"] = torch.tensor(self.labels[idx], dtype=torch.long)
        return item


train_dataset = HallucinationDataset(train_encodings, train_labels)
val_dataset   = HallucinationDataset(val_encodings,   val_labels)
test_dataset  = HallucinationDataset(test_encodings,  test_labels)


# ─────────────────────────────────────────────
# STEP 5 — LOAD MODEL
# ─────────────────────────────────────────────

print("Loading DistilBERT model...")
model = DistilBertForSequenceClassification.from_pretrained(
    MODEL_NAME,
    num_labels=2,
    id2label={0: "FACTUAL", 1: "HALLUCINATION"},
    label2id={"FACTUAL": 0, "HALLUCINATION": 1}
)
model.to(device)


# ─────────────────────────────────────────────
# STEP 6 — METRICS
# ─────────────────────────────────────────────

def compute_metrics(eval_pred):
    logits, labels = eval_pred
    predictions = np.argmax(logits, axis=1)

    acc = accuracy_score(labels, predictions)
    precision, recall, f1, _ = precision_recall_fscore_support(
        labels, predictions, average="binary"
    )

    return {
        "accuracy":  round(acc, 4),
        "precision": round(precision, 4),
        "recall":    round(recall, 4),
        "f1":        round(f1, 4)
    }


# ─────────────────────────────────────────────
# STEP 7 — TRAINING ARGUMENTS
# ─────────────────────────────────────────────

training_args = TrainingArguments(
    output_dir="./checkpoints",
    num_train_epochs=EPOCHS,
    per_device_train_batch_size=BATCH_SIZE,
    per_device_eval_batch_size=BATCH_SIZE,
    learning_rate=LEARNING_RATE,
    warmup_ratio=0.1,
    weight_decay=0.01,
    eval_strategy="epoch",          # ← changed from evaluation_strategy
    save_strategy="epoch",
    load_best_model_at_end=True,
    metric_for_best_model="f1",
    logging_dir="./logs",
    logging_steps=50,
    seed=SEED,
    report_to="none"
)


# ─────────────────────────────────────────────
# STEP 8 — TRAIN
# ─────────────────────────────────────────────

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_dataset,
    eval_dataset=val_dataset,
    compute_metrics=compute_metrics,
    callbacks=[EarlyStoppingCallback(early_stopping_patience=2)]
)

print("\nStarting training...\n")
trainer.train()


# ─────────────────────────────────────────────
# STEP 9 — EVALUATE ON TEST SET
# ─────────────────────────────────────────────

print("\nEvaluating on test set...")
results = trainer.evaluate(test_dataset)

print("\n─── TEST RESULTS ───")
for key, val in results.items():
    print(f"  {key}: {val}")

# Confusion matrix
predictions = trainer.predict(test_dataset)
pred_labels = np.argmax(predictions.predictions, axis=1)
cm = confusion_matrix(test_labels, pred_labels)
print(f"\nConfusion Matrix:\n{cm}")
print(f"  True Negatives  (correctly said factual):       {cm[0][0]}")
print(f"  False Positives (wrongly flagged factual):      {cm[0][1]}")
print(f"  False Negatives (missed hallucination):         {cm[1][0]}")
print(f"  True Positives  (correctly caught hallucination): {cm[1][1]}")


# ─────────────────────────────────────────────
# STEP 10 — SAVE MODEL
# ─────────────────────────────────────────────

print(f"\nSaving model to {SAVE_PATH}...")
os.makedirs(SAVE_PATH, exist_ok=True)

model.save_pretrained(SAVE_PATH)
tokenizer.save_pretrained(SAVE_PATH)

# Save results too — useful for your presentation
with open(f"{SAVE_PATH}/test_results.json", "w") as f:
    json.dump(results, f, indent=2)

print("\nDone. Model saved.")
print(f"Final F1 Score: {results.get('eval_f1', 'N/A')}")
print(f"Final Accuracy: {results.get('eval_accuracy', 'N/A')}\n")