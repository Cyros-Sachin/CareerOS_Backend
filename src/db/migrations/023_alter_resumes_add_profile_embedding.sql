ALTER TABLE resumes ADD COLUMN profile_embedding vector(768);
CREATE INDEX idx_resumes_profile_embedding ON resumes USING ivfflat (profile_embedding vector_cosine_ops) WITH (lists = 100);
