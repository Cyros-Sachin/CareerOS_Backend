CREATE TABLE institution_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  degree VARCHAR(100) NOT NULL,
  graduation_year INTEGER NOT NULL,
  label VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_batches_institution_degree_year ON institution_batches(institution_id, degree, graduation_year);
