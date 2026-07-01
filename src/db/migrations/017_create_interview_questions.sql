CREATE TABLE interview_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  question_order SMALLINT NOT NULL,
  question_text TEXT NOT NULL,
  language VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(session_id, question_order)
);

CREATE INDEX idx_interview_questions_session ON interview_questions(session_id);
