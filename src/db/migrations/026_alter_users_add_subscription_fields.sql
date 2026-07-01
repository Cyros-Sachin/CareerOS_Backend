CREATE TYPE student_verification_status AS ENUM ('unverified', 'pending', 'verified');

ALTER TABLE users ADD COLUMN subscription_expires_at TIMESTAMP;
ALTER TABLE users ADD COLUMN student_verification_status student_verification_status DEFAULT 'unverified';
