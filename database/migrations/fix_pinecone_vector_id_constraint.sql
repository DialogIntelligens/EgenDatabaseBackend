-- Allow pinecone_vector_id to be NULL for scheduled uploads
-- This is necessary because scheduled uploads are stored in the database first
-- and then processed later when their scheduled time arrives
ALTER TABLE pinecone_data ALTER COLUMN pinecone_vector_id DROP NOT NULL;
