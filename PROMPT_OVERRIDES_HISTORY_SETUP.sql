-- ================================================================
-- PROMPT OVERRIDES HISTORY - VERSION TRACKING SYSTEM
-- ================================================================
-- This script creates a history table to track all changes made to
-- prompt overrides, allowing users to revert to previous versions.
-- 
-- Execute these statements in pgAdmin in the correct order.
-- ================================================================

-- Step 1: Create the history table
CREATE TABLE IF NOT EXISTS prompt_overrides_history (
    id SERIAL PRIMARY KEY,
    override_id INTEGER,  -- Reference to prompt_overrides.id (can be null if override was deleted)
    chatbot_id INTEGER NOT NULL,
    flow_key VARCHAR(100) NOT NULL,
    section_key NUMERIC NOT NULL,
    action VARCHAR(20) NOT NULL CHECK (action IN ('add', 'modify', 'remove')),
    content TEXT,
    saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    saved_by INTEGER  -- Optional: user_id who made the change
);

-- Step 2: Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_prompt_overrides_history_override_id 
    ON prompt_overrides_history(override_id);

CREATE INDEX IF NOT EXISTS idx_prompt_overrides_history_chatbot_flow 
    ON prompt_overrides_history(chatbot_id, flow_key);

CREATE INDEX IF NOT EXISTS idx_prompt_overrides_history_section 
    ON prompt_overrides_history(chatbot_id, flow_key, section_key);

CREATE INDEX IF NOT EXISTS idx_prompt_overrides_history_saved_at 
    ON prompt_overrides_history(saved_at DESC);

-- Step 3: Add a comment to the table for documentation
COMMENT ON TABLE prompt_overrides_history IS 
    'Stores historical versions of prompt overrides to enable version tracking and revert functionality. ' ||
    'Each time an override is modified, the previous version is saved here before the update.';

-- Step 4: Add a column to prompt_overrides to track last modified user (optional)
-- This is useful for audit trails
ALTER TABLE prompt_overrides 
ADD COLUMN IF NOT EXISTS modified_by INTEGER;

COMMENT ON COLUMN prompt_overrides.modified_by IS 
    'User ID of the person who last modified this override';

-- ================================================================
-- VERIFICATION QUERIES
-- ================================================================
-- Run these to verify the setup was successful:

-- Check if the history table was created successfully
SELECT 
    table_name, 
    table_type 
FROM 
    information_schema.tables 
WHERE 
    table_name = 'prompt_overrides_history';

-- Check the columns in the history table
SELECT 
    column_name, 
    data_type, 
    is_nullable 
FROM 
    information_schema.columns 
WHERE 
    table_name = 'prompt_overrides_history' 
ORDER BY 
    ordinal_position;

-- Check indexes created
SELECT 
    indexname, 
    indexdef 
FROM 
    pg_indexes 
WHERE 
    tablename = 'prompt_overrides_history';

-- ================================================================
-- EXAMPLE QUERIES FOR VIEWING HISTORY
-- ================================================================

-- View all history for a specific chatbot and flow
-- Replace 475 with your chatbot_id and 'main' with your flow_key
-- SELECT 
--     h.id,
--     h.section_key,
--     h.action,
--     LEFT(h.content, 100) as content_preview,
--     h.saved_at,
--     h.saved_by
-- FROM 
--     prompt_overrides_history h
-- WHERE 
--     h.chatbot_id = 475
--     AND h.flow_key = 'main'
-- ORDER BY 
--     h.saved_at DESC;

-- View history for a specific section
-- SELECT 
--     h.id,
--     h.action,
--     h.content,
--     h.saved_at,
--     po.content as current_content
-- FROM 
--     prompt_overrides_history h
-- LEFT JOIN 
--     prompt_overrides po ON po.id = h.override_id
-- WHERE 
--     h.chatbot_id = 475
--     AND h.flow_key = 'main'
--     AND h.section_key = 1001.1
-- ORDER BY 
--     h.saved_at DESC;

-- ================================================================
-- CLEANUP (USE WITH CAUTION!)
-- ================================================================
-- Only run this if you need to remove the history system:
-- DROP TABLE IF EXISTS prompt_overrides_history CASCADE;
-- ALTER TABLE prompt_overrides DROP COLUMN IF EXISTS modified_by;

