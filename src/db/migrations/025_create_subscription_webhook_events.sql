CREATE TABLE subscription_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razorpay_event_id VARCHAR(64) UNIQUE NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMP DEFAULT NOW()
);
