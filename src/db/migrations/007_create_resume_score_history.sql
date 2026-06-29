CREATE TABLE resume_score_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ats_score INTEGER NOT NULL,
  dimension_scores JSONB NOT NULL,
  recorded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_score_history_user_recorded ON resume_score_history(user_id, recorded_at);
