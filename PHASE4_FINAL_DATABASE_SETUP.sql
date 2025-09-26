-- PHASE 4 FINAL DATABASE SETUP
-- Complete conversation logic migration - Final database configuration
-- Run this SQL in pgAdmin to complete the migration

-- ================================================
-- 1. ADD FLOW KEY COLUMNS TO CHATBOT_SETTINGS
-- ================================================
ALTER TABLE chatbot_settings 
ADD COLUMN IF NOT EXISTS flow2_key TEXT,
ADD COLUMN IF NOT EXISTS flow3_key TEXT,
ADD COLUMN IF NOT EXISTS flow4_key TEXT,
ADD COLUMN IF NOT EXISTS apiflow_key TEXT,
ADD COLUMN IF NOT EXISTS metadata_key TEXT,
ADD COLUMN IF NOT EXISTS metadata2_key TEXT;

-- Add comments for documentation
COMMENT ON COLUMN chatbot_settings.flow2_key IS 'Flow2 routing key from integration script';
COMMENT ON COLUMN chatbot_settings.flow3_key IS 'Flow3 routing key from integration script';
COMMENT ON COLUMN chatbot_settings.flow4_key IS 'Flow4 routing key from integration script';
COMMENT ON COLUMN chatbot_settings.apiflow_key IS 'API flow routing key from integration script';
COMMENT ON COLUMN chatbot_settings.metadata_key IS 'Metadata flow routing key from integration script';
COMMENT ON COLUMN chatbot_settings.metadata2_key IS 'Metadata2 flow routing key from integration script';

-- ================================================
-- 2. INSERT VINHUSET FLOW KEYS (from It_script_new.js)
-- ================================================
INSERT INTO chatbot_settings (
  chatbot_id,
  flow2_key,
  flow3_key,
  flow4_key,
  apiflow_key,
  metadata_key,
  metadata2_key,
  updated_at
) VALUES (
  'vinhuset',
  NULL,
  'product',
  'productfilter',
  'order',
  'productfilter',
  NULL,
  NOW()
) 
ON CONFLICT (chatbot_id) 
DO UPDATE SET
  flow2_key = EXCLUDED.flow2_key,
  flow3_key = EXCLUDED.flow3_key,
  flow4_key = EXCLUDED.flow4_key,
  apiflow_key = EXCLUDED.apiflow_key,
  metadata_key = EXCLUDED.metadata_key,
  metadata2_key = EXCLUDED.metadata2_key,
  updated_at = NOW();

-- ================================================
-- 3. VERIFY COMPLETE CONFIGURATION
-- ================================================
SELECT 
  'Configuration verification' as check_type,
  chatbot_id,
  -- Flow keys
  flow2_key,
  flow3_key,
  flow4_key,
  apiflow_key,
  metadata_key,
  metadata2_key,
  -- Pinecone configuration
  pinecone_api_key IS NOT NULL as has_api_key,
  knowledgebase_index_endpoint as default_index,
  flow2_knowledgebase_index as flow2_index,
  flow3_knowledgebase_index as flow3_index,
  flow4_knowledgebase_index as flow4_index,
  apiflow_knowledgebase_index as apiflow_index,
  -- Other settings
  first_message IS NOT NULL as has_first_message,
  image_enabled,
  camera_button_enabled,
  updated_at
FROM chatbot_settings 
WHERE chatbot_id = 'vinhuset';

-- ================================================
-- 4. VERIFY ALL REQUIRED TABLES EXIST
-- ================================================
SELECT 
  'Table verification' as check_type,
  table_name,
  'exists' as status
FROM information_schema.tables 
WHERE table_name IN (
  'conversation_sessions',
  'streaming_sessions', 
  'streaming_events',
  'conversation_processing_metrics',
  'chatbot_settings',
  'flow_template_assignments',
  'flow_topk_settings',
  'flow_pinecone_api_keys'
)
ORDER BY table_name;

-- ================================================
-- 5. CHECK SYSTEM HEALTH
-- ================================================
-- Check recent conversation activity
SELECT 
  'Activity check' as check_type,
  COUNT(*) as total_sessions,
  COUNT(CASE WHEN status = 'active' THEN 1 END) as active_sessions,
  COUNT(CASE WHEN created_at > NOW() - INTERVAL '1 hour' THEN 1 END) as recent_sessions
FROM conversation_sessions;

-- Check streaming sessions
SELECT 
  'Streaming check' as check_type,
  COUNT(*) as total_streaming,
  COUNT(CASE WHEN status = 'active' THEN 1 END) as active_streaming,
  COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_streaming,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_streaming
FROM streaming_sessions
WHERE created_at > NOW() - INTERVAL '24 hours';

-- Check error logs
SELECT 
  'Error check' as check_type,
  error_category,
  COUNT(*) as error_count
FROM error_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY error_category
ORDER BY error_count DESC;

-- ================================================
-- 6. PERFORMANCE METRICS CHECK
-- ================================================
SELECT 
  'Performance check' as check_type,
  chatbot_id,
  flow_type,
  COUNT(*) as conversation_count,
  ROUND(AVG(total_processing_time_ms)) as avg_processing_time_ms,
  ROUND(AVG(time_to_first_token_ms)) as avg_time_to_first_token_ms,
  ROUND(AVG(tokens_per_second), 2) as avg_tokens_per_second
FROM conversation_processing_metrics
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY chatbot_id, flow_type
ORDER BY conversation_count DESC;

-- ================================================
-- PHASE 4 MIGRATION COMPLETE!
-- ================================================
-- After running this script, your system will have:
-- ✅ Complete flow key configuration from database
-- ✅ All conversation logic running on backend
-- ✅ Performance optimizations active (caching, pooling)
-- ✅ Comprehensive monitoring and error handling
-- ✅ Automatic cleanup and maintenance
-- ✅ Production-ready conversation processing system
--
-- The conversation logic migration is now 100% complete!
-- ================================================
