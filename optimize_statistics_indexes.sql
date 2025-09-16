-- Database optimization indexes for statistics performance
-- Run this entire script in pgAdmin - it will work without transaction issues

-- Essential indexes for conversation queries
CREATE INDEX IF NOT EXISTS idx_conversations_chatbot_created 
ON conversations(chatbot_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_chatbot_emne 
ON conversations(chatbot_id, emne) WHERE emne IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_ratings 
ON conversations(chatbot_id, customer_rating) WHERE customer_rating IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_fallback 
ON conversations(chatbot_id, fallback) WHERE fallback IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_purchase_tracking 
ON conversations(chatbot_id, purchase_tracking_enabled) WHERE purchase_tracking_enabled IS NOT NULL;

-- Index for livechat conversations
CREATE INDEX IF NOT EXISTS idx_conversations_livechat 
ON conversations(chatbot_id, is_livechat, created_at DESC) WHERE is_livechat = true;

-- Composite index for common filtering combinations
CREATE INDEX IF NOT EXISTS idx_conversations_chatbot_date_emne 
ON conversations(chatbot_id, created_at DESC, emne) WHERE emne IS NOT NULL;

-- Index to optimize the JSON operations (PostgreSQL 12+)
-- This helps with the jsonb_array_elements operations
CREATE INDEX IF NOT EXISTS idx_conversations_data_gin 
ON conversations USING gin (conversation_data);

-- Optional: Partial index for conversations with actual data
CREATE INDEX IF NOT EXISTS idx_conversations_with_data 
ON conversations(chatbot_id, created_at DESC) 
WHERE conversation_data IS NOT NULL 
  AND jsonb_array_length(conversation_data::jsonb) > 0;

-- Index for business hours analysis (hour extraction)
CREATE INDEX IF NOT EXISTS idx_conversations_hour_dow 
ON conversations(chatbot_id, EXTRACT(HOUR FROM created_at), EXTRACT(DOW FROM created_at));

-- Show index usage after creation
-- You can run this query to see if the indexes are being used:
-- EXPLAIN (ANALYZE, BUFFERS) SELECT c.*, 
--   COALESCE((SELECT COUNT(*) FROM jsonb_array_elements(c.conversation_data::jsonb) as msg WHERE (msg->>'isUser')::boolean = true), 0) as user_message_count
-- FROM conversations c 
-- WHERE c.chatbot_id = ANY(ARRAY['your_chatbot_id']) 
-- ORDER BY c.created_at DESC;
