CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE subscription_tier AS ENUM ('free', 'student', 'pro');
CREATE TYPE skill_level AS ENUM ('beginner', 'mid', 'advanced');
CREATE TYPE user_role AS ENUM ('student', 'institution_admin');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  name VARCHAR(255) NOT NULL,
  google_id VARCHAR(255) UNIQUE,
  email_verified BOOLEAN DEFAULT FALSE,
  college VARCHAR(255),
  degree VARCHAR(100),
  graduation_year INTEGER,
  career_goals TEXT[] DEFAULT '{}',
  work_preferences TEXT[] DEFAULT '{}',
  target_companies TEXT[] DEFAULT '{}',
  skill_level skill_level,
  onboarding_step INTEGER DEFAULT 0,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  subscription_tier subscription_tier DEFAULT 'free',
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP,
  role user_role DEFAULT 'student',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
