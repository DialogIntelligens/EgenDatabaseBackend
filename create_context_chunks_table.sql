-- Migration script to create message_context_chunks table
-- Run this script to add context chunk storage functionality

CREATE TABLE IF NOT EXISTS message_context_chunks (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL,
    message_index INTEGER NOT NULL,
    chunk_content TEXT NOT NULL,
    chunk_metadata JSONB,
    similarity_score DECIMAL(5,4),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Create composite index for efficient lookups
    CONSTRAINT unique_chunk_per_message UNIQUE (conversation_id, message_index, id)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_context_chunks_conversation_message 
ON message_context_chunks (conversation_id, message_index);

CREATE INDEX IF NOT EXISTS idx_context_chunks_created_at 
ON message_context_chunks (created_at);

CREATE INDEX IF NOT EXISTS idx_context_chunks_similarity_score 
ON message_context_chunks (similarity_score DESC);

-- Add comments for documentation
COMMENT ON TABLE message_context_chunks IS 'Stores context chunks used by AI responses for transparency';
COMMENT ON COLUMN message_context_chunks.conversation_id IS 'References the conversation this chunk belongs to';
COMMENT ON COLUMN message_context_chunks.message_index IS 'Index of the message in the conversation array';
COMMENT ON COLUMN message_context_chunks.chunk_content IS 'The actual text content of the context chunk';
COMMENT ON COLUMN message_context_chunks.chunk_metadata IS 'JSON metadata including source, title, page, etc.';
COMMENT ON COLUMN message_context_chunks.similarity_score IS 'Similarity score from vector search (0.0-1.0)'; 