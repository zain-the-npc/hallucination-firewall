FROM python:3.11-slim
WORKDIR /app
RUN pip install torch --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
RUN python -c "from transformers import DistilBertTokenizerFast, DistilBertForSequenceClassification; DistilBertTokenizerFast.from_pretrained('zain-the-npc/hallucination-firewall'); DistilBertForSequenceClassification.from_pretrained('zain-the-npc/hallucination-firewall')"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]