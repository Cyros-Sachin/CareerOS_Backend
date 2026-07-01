CREATE TYPE interview_mode AS ENUM ('technical', 'system_design', 'hr');
CREATE TYPE interview_difficulty AS ENUM ('easy', 'medium', 'hard');
CREATE TYPE interview_status AS ENUM ('in_progress', 'completed', 'abandoned');

CREATE TABLE interview_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode interview_mode NOT NULL,
  difficulty interview_difficulty,
  topic VARCHAR(100),
  target_role VARCHAR(100) NOT NULL,
  status interview_status DEFAULT 'in_progress',
  time_limit_seconds INTEGER NOT NULL,
  total_score INTEGER,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_interview_sessions_user_created ON interview_sessions(user_id, created_at DESC);
