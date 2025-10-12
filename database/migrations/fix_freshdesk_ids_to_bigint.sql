-- Fix Freshdesk ID columns to use BIGINT instead of INTEGER
-- Run this if you already ran add_integration_settings.sql with INTEGER columns

-- Change freshdesk_group_id from INTEGER to BIGINT
ALTER TABLE chatbot_settings 
ALTER COLUMN freshdesk_group_id TYPE BIGINT;

-- Change freshdesk_product_id from INTEGER to BIGINT
ALTER TABLE chatbot_settings 
ALTER COLUMN freshdesk_product_id TYPE BIGINT;

-- Verify the change
SELECT 
    column_name, 
    data_type, 
    character_maximum_length
FROM information_schema.columns
WHERE table_name = 'chatbot_settings' 
AND column_name IN ('freshdesk_group_id', 'freshdesk_product_id');

-- This should now show 'bigint' as the data_type

