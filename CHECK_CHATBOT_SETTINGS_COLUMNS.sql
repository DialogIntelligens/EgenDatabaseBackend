-- Check what columns actually exist in chatbot_settings table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'chatbot_settings'
ORDER BY ordinal_position;
