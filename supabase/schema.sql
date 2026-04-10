create table hallucination_logs (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp default now(),
  user_question text not null,
  gpt_raw_answer text not null,
  hallucination_score float not null,
  status text not null, -- 'PASSED' | 'FLAGGED' | 'CORRECTED'
  corrected_answer text,
  sources text[],        -- array of URLs used in RAG
  model_version text     -- track which classifier version was used
);
