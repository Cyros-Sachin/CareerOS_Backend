CREATE TABLE institutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255) UNIQUE,
  contact_email VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
