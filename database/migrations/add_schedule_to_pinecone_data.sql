ALTER TABLE pinecone_data ADD COLUMN scheduled_time TIMESTAMP NULL;
ALTER TABLE pinecone_data ADD COLUMN is_scheduled BOOLEAN DEFAULT FALSE;
