import { 
  getPineconeApiKeyForIndex, 
  initializePineconeClient, 
  createVectorId, 
  prepareVectorMetadata, 
  generateEmbedding 
} from '../utils/pineconeUtils.js';

/**
 * Process scheduled uploads that are due
 */
export async function processScheduledUploads(pool) {
  try {
    // Use ISO string for proper timezone handling
    const now = new Date().toISOString();
    const scheduledUploads = await pool.query(
      `SELECT id, title, text, pinecone_index_name, namespace, user_id
       FROM pinecone_data
       WHERE scheduled_time IS NOT NULL
       AND scheduled_time <= $1::timestamptz
       AND is_scheduled = true
       AND pinecone_vector_id IS NULL`,
      [now]
    );

    const processedUploads = [];

    for (const upload of scheduledUploads.rows) {
      try {
        // Get Pinecone API key using the proper utility function
        const pineconeApiKey = await getPineconeApiKeyForIndex(
          pool, 
          upload.user_id, 
          upload.pinecone_index_name, 
          upload.namespace
        );

        // Generate embedding using the utility function
        const embedding = await generateEmbedding(upload.text);

        // Initialize Pinecone using the utility function
        const pineconeClient = initializePineconeClient(pineconeApiKey);
        const index = pineconeClient.index(upload.namespace);

        // Create unique vector ID using the utility function
        const vectorId = createVectorId();

        // Prepare vector metadata using the utility function
        const vectorMetadata = prepareVectorMetadata(upload.user_id, upload.text, upload.title);

        // Prepare vector
        const vector = {
          id: vectorId,
          values: embedding,
          metadata: vectorMetadata
        };

        // Upsert into Pinecone
        await index.upsert([vector], { namespace: upload.namespace });

        // Update database record
        await pool.query(
          `UPDATE pinecone_data
           SET pinecone_vector_id = $1, is_scheduled = false, scheduled_time = NULL
           WHERE id = $2`,
          [vectorId, upload.id]
        );

        processedUploads.push({
          id: upload.id,
          title: upload.title,
          success: true
        });

        console.log(`Scheduled upload with ID ${upload.id} processed successfully`);
      } catch (error) {
        console.error(`Error processing scheduled upload ${upload.id}:`, error);
        processedUploads.push({
          id: upload.id,
          title: upload.title,
          success: false,
          error: error.message
        });
      }
    }

    return {
      processed: processedUploads.length,
      uploads: processedUploads
    };
  } catch (error) {
    console.error('Error in processScheduledUploads:', error);
    throw error;
  }
}
