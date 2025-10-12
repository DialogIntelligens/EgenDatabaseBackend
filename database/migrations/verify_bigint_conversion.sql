-- Verify that freshdesk columns are BIGINT

SELECT 
    table_name,
    column_name, 
    data_type,
    character_maximum_length,
    numeric_precision
FROM information_schema.columns
WHERE table_name = 'chatbot_settings' 
AND column_name IN ('freshdesk_group_id', 'freshdesk_product_id')
ORDER BY column_name;

-- Expected output:
-- freshdesk_group_id  | bigint
-- freshdesk_product_id| bigint

-- If still showing 'integer', run:
-- \i fix_freshdesk_ids_to_bigint.sql

