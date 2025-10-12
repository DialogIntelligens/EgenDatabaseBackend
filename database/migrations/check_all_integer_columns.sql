-- Find ALL integer columns in chatbot_settings table
SELECT 
    column_name,
    data_type,
    character_maximum_length
FROM information_schema.columns
WHERE table_name = 'chatbot_settings'
AND data_type IN ('integer', 'smallint', 'bigint')
ORDER BY ordinal_position;

-- This will show us if there are any other INTEGER columns
-- that might be receiving values > 2,147,483,647

