CREATE TYPE application_status AS ENUM ('applied', 'interview', 'offer', 'rejected');

CREATE TABLE job_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES jobs(id),
  status application_status DEFAULT 'applied',
  applied_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  notes TEXT
);

CREATE UNIQUE INDEX idx_job_applications_user_job ON job_applications(user_id, job_id);
CREATE INDEX idx_job_applications_user ON job_applications(user_id);

CREATE TRIGGER set_job_applications_updated_at
  BEFORE UPDATE ON job_applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
