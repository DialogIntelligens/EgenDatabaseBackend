-- Create table for Freshdesk ticket queue
CREATE TABLE IF NOT EXISTS freshdesk_ticket_queue (
    id SERIAL PRIMARY KEY,
    ticket_data JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    next_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    error_message TEXT,
    freshdesk_ticket_id VARCHAR(255),
    chatbot_id VARCHAR(255),
    user_id VARCHAR(255)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_freshdesk_queue_status ON freshdesk_ticket_queue(status);
CREATE INDEX IF NOT EXISTS idx_freshdesk_queue_next_attempt ON freshdesk_ticket_queue(next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_freshdesk_queue_created_at ON freshdesk_ticket_queue(created_at);

-- Add comments for documentation
COMMENT ON TABLE freshdesk_ticket_queue IS 'Queue for processing Freshdesk tickets asynchronously';
COMMENT ON COLUMN freshdesk_ticket_queue.ticket_data IS 'JSON data containing all ticket information';
COMMENT ON COLUMN freshdesk_ticket_queue.status IS 'Status: pending, processing, completed, failed';
COMMENT ON COLUMN freshdesk_ticket_queue.attempts IS 'Number of processing attempts made';
COMMENT ON COLUMN freshdesk_ticket_queue.next_attempt_at IS 'When to attempt processing next (for exponential backoff)';
