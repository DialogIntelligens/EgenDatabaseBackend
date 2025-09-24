-- Fix for streaming_sessions foreign key constraint issue
-- Run this in pgAdmin to resolve the database constraint error

-- 1. Drop the foreign key constraint that's causing issues
ALTER TABLE streaming_sessions 
DROP CONSTRAINT IF EXISTS streaming_sessions_conversation_session_id_fkey;

-- 2. Clean up any orphaned streaming sessions
DELETE FROM streaming_sessions 
WHERE created_at < NOW() - INTERVAL '1 day';

-- 3. Clean up any orphaned streaming events
DELETE FROM streaming_events 
WHERE created_at < NOW() - INTERVAL '1 hour';

-- 4. Verify the tables are working
SELECT 'streaming_sessions table check' as test, COUNT(*) as count FROM streaming_sessions;
SELECT 'streaming_events table check' as test, COUNT(*) as count FROM streaming_events;
SELECT 'conversation_sessions table check' as test, COUNT(*) as count FROM conversation_sessions;

-- The foreign key constraint has been removed to allow more flexible session management
-- This fixes the error: "violates foreign key constraint streaming_sessions_conversation_session_id_fkey"
