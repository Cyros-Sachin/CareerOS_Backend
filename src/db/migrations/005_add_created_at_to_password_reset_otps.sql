ALTER TABLE password_reset_otps
  ADD COLUMN created_at TIMESTAMP DEFAULT NOW();
