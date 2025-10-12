-- Convert ALL integer columns to BIGINT to prevent any overflow issues
-- This is a safe operation and won't affect existing data

DO $$
BEGIN
    -- Convert id column to BIGINT (primary key)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='chatbot_settings' 
        AND column_name='id' 
        AND data_type='integer'
    ) THEN
        ALTER TABLE chatbot_settings ALTER COLUMN id TYPE BIGINT;
        RAISE NOTICE 'Column id altered to BIGINT.';
    ELSE
        RAISE NOTICE 'Column id is already BIGINT or does not exist.';
    END IF;

    -- Convert rating_timer_duration to BIGINT (just to be safe)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='chatbot_settings' 
        AND column_name='rating_timer_duration' 
        AND data_type='integer'
    ) THEN
        ALTER TABLE chatbot_settings ALTER COLUMN rating_timer_duration TYPE BIGINT;
        RAISE NOTICE 'Column rating_timer_duration altered to BIGINT.';
    ELSE
        RAISE NOTICE 'Column rating_timer_duration is already BIGINT or does not exist.';
    END IF;

    -- freshdesk_group_id and freshdesk_product_id should already be BIGINT from previous migration
    -- but let's verify they stayed BIGINT
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='chatbot_settings' 
        AND column_name='freshdesk_group_id' 
        AND data_type='integer'
    ) THEN
        ALTER TABLE chatbot_settings ALTER COLUMN freshdesk_group_id TYPE BIGINT;
        RAISE NOTICE 'Column freshdesk_group_id altered to BIGINT.';
    ELSE
        RAISE NOTICE 'Column freshdesk_group_id is already BIGINT or does not exist.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='chatbot_settings' 
        AND column_name='freshdesk_product_id' 
        AND data_type='integer'
    ) THEN
        ALTER TABLE chatbot_settings ALTER COLUMN freshdesk_product_id TYPE BIGINT;
        RAISE NOTICE 'Column freshdesk_product_id altered to BIGINT.';
    ELSE
        RAISE NOTICE 'Column freshdesk_product_id is already BIGINT or does not exist.';
    END IF;
END $$;

-- Verify all conversions
SELECT 
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'chatbot_settings'
AND data_type IN ('integer', 'smallint', 'bigint')
ORDER BY ordinal_position;

