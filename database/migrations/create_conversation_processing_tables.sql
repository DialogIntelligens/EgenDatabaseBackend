-- Migration for Conversation Processing System
-- Creates tables needed for backend conversation processing

-- Table for tracking active conversation sessions
CREATE TABLE IF NOT EXISTS conversation_sessions (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    chatbot_id VARCHAR(255) NOT NULL,
    session_id VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'active',
    configuration JSONB DEFAULT '{}'::jsonb,
    
    -- Ensure one active session per user-chatbot combination
    UNIQUE(user_id, chatbot_id)
);

-- Table for managing streaming sessions
CREATE TABLE IF NOT EXISTS streaming_sessions (
    id SERIAL PRIMARY KEY,
    streaming_session_id VARCHAR(255) NOT NULL UNIQUE,
    conversation_session_id VARCHAR(255), -- Remove foreign key constraint to avoid issues
    api_url TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'active', -- active, completed, failed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    final_result JSONB
);

-- Table for storing streaming events (SSE events)
CREATE TABLE IF NOT EXISTS streaming_events (
    id SERIAL PRIMARY KEY,
    streaming_session_id VARCHAR(255) NOT NULL REFERENCES streaming_sessions(streaming_session_id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL, -- start, token, end, error, context, marker
    event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for tracking conversation processing performance
CREATE TABLE IF NOT EXISTS conversation_processing_metrics (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    chatbot_id VARCHAR(255) NOT NULL,
    flow_type VARCHAR(50),
    total_processing_time_ms INTEGER,
    time_to_first_token_ms INTEGER,
    token_count INTEGER DEFAULT 0,
    tokens_per_second DECIMAL(10,2),
    parallel_execution BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    performance_data JSONB DEFAULT '{}'::jsonb
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_conversation_sessions_user_chatbot ON conversation_sessions(user_id, chatbot_id);
CREATE INDEX IF NOT EXISTS idx_conversation_sessions_last_activity ON conversation_sessions(last_activity);
CREATE INDEX IF NOT EXISTS idx_streaming_sessions_session_id ON streaming_sessions(streaming_session_id);
CREATE INDEX IF NOT EXISTS idx_streaming_sessions_status ON streaming_sessions(status);
CREATE INDEX IF NOT EXISTS idx_streaming_events_session_id ON streaming_events(streaming_session_id);
CREATE INDEX IF NOT EXISTS idx_streaming_events_created_at ON streaming_events(created_at);
CREATE INDEX IF NOT EXISTS idx_processing_metrics_chatbot_id ON conversation_processing_metrics(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_processing_metrics_created_at ON conversation_processing_metrics(created_at);

-- Comments for documentation
COMMENT ON TABLE conversation_sessions IS 'Active conversation sessions for backend processing';
COMMENT ON TABLE streaming_sessions IS 'Streaming sessions for SSE responses';
COMMENT ON TABLE streaming_events IS 'Individual SSE events for frontend polling';
COMMENT ON TABLE conversation_processing_metrics IS 'Performance metrics for conversation processing';

COMMENT ON COLUMN conversation_sessions.session_id IS 'Unique session identifier';
COMMENT ON COLUMN conversation_sessions.configuration IS 'Session-specific configuration overrides';
COMMENT ON COLUMN streaming_sessions.streaming_session_id IS 'Unique streaming session identifier';
COMMENT ON COLUMN streaming_events.event_type IS 'Type of SSE event: start, token, end, error, context, marker';
COMMENT ON COLUMN streaming_events.event_data IS 'Event payload data';
COMMENT ON COLUMN conversation_processing_metrics.performance_data IS 'Detailed performance tracking data';
