CREATE TYPE plan_type AS ENUM ('student_monthly', 'student_annual', 'pro_monthly', 'pro_annual');
CREATE TYPE payment_status AS ENUM ('created', 'paid', 'failed');

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  razorpay_order_id VARCHAR(64) UNIQUE NOT NULL,
  razorpay_payment_id VARCHAR(64) UNIQUE,
  plan plan_type NOT NULL,
  amount_paise INTEGER NOT NULL,
  currency VARCHAR(3) DEFAULT 'INR',
  status payment_status DEFAULT 'created',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_payments_user_created ON payments(user_id, created_at DESC);

CREATE TRIGGER set_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
