-- Migration: Add split_test_id column to conversations table
-- Purpose: Track which split test variant was used for each conversation
-- Date: 2025-01-09

-- Add split_test_id column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'conversations' 
        AND column_name = 'split_test_id'
    ) THEN
        ALTER TABLE conversations 
        ADD COLUMN split_test_id TEXT;
        
        -- Add index for better query performance
        CREATE INDEX idx_conversations_split_test_id 
        ON conversations(split_test_id)
        WHERE split_test_id IS NOT NULL;
        
        RAISE NOTICE 'Added split_test_id column and index to conversations table';
    ELSE
        RAISE NOTICE 'split_test_id column already exists in conversations table';
    END IF;
END $$;

-- Verify the column exists
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns
WHERE table_name = 'conversations' 
AND column_name = 'split_test_id';

