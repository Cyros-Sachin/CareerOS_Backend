CREATE TABLE tailored_resumes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_resume_id UUID NOT NULL REFERENCES resumes(id),
  job_id UUID REFERENCES jobs(id),
  tailored_content JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_tailored_resumes_user ON tailored_resumes(user_id);
CREATE INDEX idx_tailored_resumes_job ON tailored_resumes(job_id);
