-- Add Pinecone index configuration columns to chatbot_settings table
-- This will store the index information that's currently in integration scripts

-- Add columns for Pinecone index configuration
ALTER TABLE chatbot_settings 
ADD COLUMN IF NOT EXISTS pinecone_api_key TEXT,
ADD COLUMN IF NOT EXISTS knowledgebase_index_endpoint TEXT,
ADD COLUMN IF NOT EXISTS flow2_knowledgebase_index TEXT,
ADD COLUMN IF NOT EXISTS flow3_knowledgebase_index TEXT,
ADD COLUMN IF NOT EXISTS flow4_knowledgebase_index TEXT,
ADD COLUMN IF NOT EXISTS apiflow_knowledgebase_index TEXT;

-- Add comments for documentation
COMMENT ON COLUMN chatbot_settings.pinecone_api_key IS 'Pinecone API key for this chatbot (from integration script)';
COMMENT ON COLUMN chatbot_settings.knowledgebase_index_endpoint IS 'Default Pinecone index (knowledgebaseIndexApiEndpoint from integration script)';
COMMENT ON COLUMN chatbot_settings.flow2_knowledgebase_index IS 'Pinecone index for flow2 (flow2KnowledgebaseIndex from integration script)';
COMMENT ON COLUMN chatbot_settings.flow3_knowledgebase_index IS 'Pinecone index for flow3 (flow3KnowledgebaseIndex from integration script)';
COMMENT ON COLUMN chatbot_settings.flow4_knowledgebase_index IS 'Pinecone index for flow4 (flow4KnowledgebaseIndex from integration script)';
COMMENT ON COLUMN chatbot_settings.apiflow_knowledgebase_index IS 'Pinecone index for apiflow (apiFlowKnowledgebaseIndex from integration script)';

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_chatbot_settings_chatbot_id ON chatbot_settings(chatbot_id);

-- Show current table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'chatbot_settings'
ORDER BY ordinal_position;
