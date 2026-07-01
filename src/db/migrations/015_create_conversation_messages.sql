CREATE TYPE message_role AS ENUM ('user', 'assistant');

CREATE TABLE conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role message_role NOT NULL,
  content TEXT NOT NULL,
  is_cached_response BOOLEAN DEFAULT false,
  flagged_by_safety_filter BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation_created ON conversation_messages(conversation_id, created_at);
CREATE INDEX idx_messages_user_created ON conversation_messages(user_id, created_at);
