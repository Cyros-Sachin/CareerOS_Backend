CREATE TYPE resume_status AS ENUM ('uploaded', 'processing', 'parsed', 'scored', 'failed');

CREATE TABLE resumes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_key TEXT NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  status resume_status NOT NULL DEFAULT 'uploaded',
  failure_reason TEXT,
  page_count INTEGER,
  raw_text TEXT,
  parsed_data JSONB,
  ats_score INTEGER CHECK (ats_score BETWEEN 0 AND 100),
  dimension_scores JSONB,
  suggestions JSONB,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_resumes_user_id ON resumes(user_id);
CREATE INDEX idx_resumes_status ON resumes(status);

CREATE UNIQUE INDEX idx_resumes_one_active_per_user
  ON resumes(user_id) WHERE is_active = true;

CREATE TRIGGER set_resumes_updated_at
  BEFORE UPDATE ON resumes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
