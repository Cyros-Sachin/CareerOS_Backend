CREATE TABLE interview_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES interview_questions(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  answer_text TEXT,
  last_autosaved_at TIMESTAMP,
  submitted_at TIMESTAMP,
  submitted_late BOOLEAN DEFAULT false,
  score JSONB,
  feedback TEXT,
  model_answer TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(question_id)
);

CREATE INDEX idx_interview_answers_session ON interview_answers(session_id);
