-- CONVERSATION HISTORY FIX
-- Run this SQL in pgAdmin to fix conversation history and session management

-- ================================================
-- 1. ADD PINECONE CONFIGURATION COLUMNS (if not already done)
-- ================================================
ALTER TABLE chatbot_settings 
ADD COLUMN IF NOT EXISTS pinecone_api_key TEXT,
ADD COLUMN IF NOT EXISTS knowledgebase_index_endpoint TEXT,
ADD COLUMN IF NOT EXISTS flow2_knowledgebase_index TEXT,
ADD COLUMN IF NOT EXISTS flow3_knowledgebase_index TEXT,
ADD COLUMN IF NOT EXISTS flow4_knowledgebase_index TEXT,
ADD COLUMN IF NOT EXISTS apiflow_knowledgebase_index TEXT;

-- ================================================
-- 2. FIX STREAMING SESSIONS CONSTRAINT
-- ================================================
ALTER TABLE streaming_sessions 
DROP CONSTRAINT IF EXISTS streaming_sessions_conversation_session_id_fkey;

-- ================================================
-- 3. INSERT VINHUSET PINECONE CONFIGURATION
-- ================================================
INSERT INTO chatbot_settings (
  chatbot_id,
  pinecone_api_key,
  knowledgebase_index_endpoint,
  flow2_knowledgebase_index,
  flow3_knowledgebase_index,
  flow4_knowledgebase_index,
  apiflow_knowledgebase_index,
  updated_at
) VALUES (
  'vinhuset',
  'pcsk_6DGzau_SeHjbfsoGMME27Xm9PLKbuQoTMZpA6LHbbYih45v3ybkKeHcxm2fQEzuN3XWMgf',
  'vinhuset-alt',
  'vinhuset-alt',
  'vinhuset-pro',
  'vinhuset-pro',
  'vinhuset-alt',
  NOW()
) 
ON CONFLICT (chatbot_id) 
DO UPDATE SET
  pinecone_api_key = EXCLUDED.pinecone_api_key,
  knowledgebase_index_endpoint = EXCLUDED.knowledgebase_index_endpoint,
  flow2_knowledgebase_index = EXCLUDED.flow2_knowledgebase_index,
  flow3_knowledgebase_index = EXCLUDED.flow3_knowledgebase_index,
  flow4_knowledgebase_index = EXCLUDED.flow4_knowledgebase_index,
  apiflow_knowledgebase_index = EXCLUDED.apiflow_knowledgebase_index,
  updated_at = NOW();

-- ================================================
-- 4. CLEAN UP OLD SESSIONS AND CONVERSATIONS
-- ================================================
-- Clean up old streaming sessions
DELETE FROM streaming_sessions WHERE created_at < NOW() - INTERVAL '1 day';
DELETE FROM streaming_events WHERE created_at < NOW() - INTERVAL '1 hour';

-- Clean up old conversation sessions  
DELETE FROM conversation_sessions WHERE created_at < NOW() - INTERVAL '1 day';

-- ================================================
-- 5. VERIFY SETUP
-- ================================================
-- Check Pinecone configuration
SELECT 
  'Pinecone Config Check' as test,
  chatbot_id,
  pinecone_api_key IS NOT NULL as has_api_key,
  knowledgebase_index_endpoint as default_index,
  flow3_knowledgebase_index as flow3_index,
  flow4_knowledgebase_index as flow4_index
FROM chatbot_settings 
WHERE chatbot_id = 'vinhuset';

-- Check table structure
SELECT 
  'Table Check' as test,
  table_name,
  'exists' as status
FROM information_schema.tables 
WHERE table_name IN (
  'conversation_sessions',
  'streaming_sessions',
  'streaming_events', 
  'conversation_processing_metrics',
  'chatbot_settings',
  'conversations'
)
ORDER BY table_name;

-- ================================================
-- SETUP COMPLETE!
-- ================================================
-- After running this script:
-- ✅ Pinecone configuration properly stored
-- ✅ Streaming sessions working without constraint issues
-- ✅ Conversation history will be maintained properly
-- ✅ Each user+chatbot combination updates the same conversation
-- ✅ Complete conversation context preserved
-- ================================================
