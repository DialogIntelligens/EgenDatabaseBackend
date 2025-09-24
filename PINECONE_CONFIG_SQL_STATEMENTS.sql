-- Pinecone Configuration Setup for Vinhuset Chatbot
-- Run these SQL statements in pgAdmin to set up the Pinecone configuration

-- 1. First, add the new columns to chatbot_settings table
ALTER TABLE chatbot_settings 
ADD COLUMN IF NOT EXISTS pinecone_api_key TEXT,
ADD COLUMN IF NOT EXISTS knowledgebase_index_endpoint TEXT,
ADD COLUMN IF NOT EXISTS flow2_knowledgebase_index TEXT,
ADD COLUMN IF NOT EXISTS flow3_knowledgebase_index TEXT,
ADD COLUMN IF NOT EXISTS flow4_knowledgebase_index TEXT,
ADD COLUMN IF NOT EXISTS apiflow_knowledgebase_index TEXT;

-- 2. Insert/Update the Pinecone configuration for vinhuset chatbot
-- (Extracted from It_script_new.js)
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

-- 3. Fix the streaming sessions constraint issue
ALTER TABLE streaming_sessions 
DROP CONSTRAINT IF EXISTS streaming_sessions_conversation_session_id_fkey;

-- 4. Clean up old sessions
DELETE FROM streaming_sessions WHERE created_at < NOW() - INTERVAL '1 day';
DELETE FROM streaming_events WHERE created_at < NOW() - INTERVAL '1 hour';

-- 5. Verify the configuration was stored correctly
SELECT 
  chatbot_id,
  pinecone_api_key IS NOT NULL as has_api_key,
  knowledgebase_index_endpoint,
  flow2_knowledgebase_index,
  flow3_knowledgebase_index,
  flow4_knowledgebase_index,
  apiflow_knowledgebase_index,
  updated_at
FROM chatbot_settings 
WHERE chatbot_id = 'vinhuset';

-- 6. Show the complete table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'chatbot_settings'
ORDER BY ordinal_position;
