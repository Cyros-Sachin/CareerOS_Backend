CREATE TABLE skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) UNIQUE NOT NULL,
  category VARCHAR(100) NOT NULL,
  aliases TEXT[] DEFAULT '{}',
  embedding vector(768),
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO skills (name, category)
SELECT DISTINCT keyword, COALESCE(category, 'general')
FROM role_keywords
ON CONFLICT (name) DO NOTHING;

CREATE INDEX idx_skills_category ON skills(category);
CREATE INDEX idx_skills_aliases ON skills USING GIN(aliases);
CREATE INDEX idx_skills_embedding ON skills USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
