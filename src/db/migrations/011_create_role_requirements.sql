CREATE TYPE proficiency_level AS ENUM ('beginner', 'mid', 'advanced');

CREATE TABLE role_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name VARCHAR(255) NOT NULL,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  importance_weight NUMERIC(3,2) DEFAULT 1.0,
  min_proficiency proficiency_level DEFAULT 'beginner',
  est_learning_hours INTEGER
);

CREATE UNIQUE INDEX idx_role_requirements_role_skill ON role_requirements(role_name, skill_id);
CREATE INDEX idx_role_requirements_role_name ON role_requirements(role_name);
