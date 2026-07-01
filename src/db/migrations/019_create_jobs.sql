CREATE TYPE job_source AS ENUM ('indeed', 'wellfound', 'manual');
CREATE TYPE company_type AS ENUM ('startup', 'mid_size', 'enterprise', 'other');

CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source job_source NOT NULL,
  external_id VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  company VARCHAR(255) NOT NULL,
  company_type company_type,
  location VARCHAR(255),
  description TEXT NOT NULL,
  jd_embedding vector(768),
  apply_url TEXT NOT NULL,
  posted_at TIMESTAMP,
  scraped_at TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_jobs_source_external ON jobs(source, external_id);
CREATE INDEX idx_jobs_active ON jobs(is_active) WHERE is_active = true;
CREATE INDEX idx_jobs_embedding ON jobs USING ivfflat (jd_embedding vector_cosine_ops) WITH (lists = 100);
