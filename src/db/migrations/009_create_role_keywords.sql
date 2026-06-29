CREATE TABLE role_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name VARCHAR(255) NOT NULL,
  keyword VARCHAR(255) NOT NULL,
  weight NUMERIC(3,2) NOT NULL DEFAULT 1.0,
  category VARCHAR(100)
);

CREATE INDEX idx_role_keywords_role ON role_keywords(role_name);
