import { getEmneAndScore } from './mainUtils.js';

/**
 * Helper function to upsert a conversation in the database
 */
export async function upsertConversation(
  pool,
  user_id,
  chatbot_id,
  conversation_data,
  emne,
  score,
  customer_rating,
  lacking_info,
  bug_status,
  purchase_tracking_enabled,
  is_livechat = false,
  fallback = null,
  ligegyldig = null,
  tags = null,
  form_data = null,
  is_flagged = false,
  is_resolved = false,
  livechat_email = null,
  split_test_id = null
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if this is a livechat conversation with a new user message
    let shouldMarkAsUnread = false;
    let shouldMarkAsUnresolved = false;
    if (is_livechat && conversation_data) {
      try {
        const parsedData = typeof conversation_data === 'string' ? JSON.parse(conversation_data) : conversation_data;
        if (Array.isArray(parsedData) && parsedData.length > 0) {
          const lastMessage = parsedData[parsedData.length - 1];
          // If last message is from user (not agent, not system), mark as unread and unresolved
          if (lastMessage && lastMessage.isUser === true) {
            shouldMarkAsUnread = true;
            shouldMarkAsUnresolved = true; // Automatically unresolve when user sends a message
          }
        }
      } catch (parseError) {
        console.error('Error parsing conversation data for unread check:', parseError);
      }
    }

    const updateResult = await client.query(
      `UPDATE conversations
       SET conversation_data = $3,
           emne = COALESCE($4, emne),
           score = COALESCE($5, score),
           customer_rating = COALESCE($6, customer_rating),
           lacking_info = COALESCE($7, lacking_info),
           bug_status = COALESCE($8, bug_status),
           purchase_tracking_enabled = COALESCE($9, purchase_tracking_enabled),
           is_livechat = COALESCE($10, is_livechat),
           fallback = COALESCE($11, fallback),
           ligegyldig = COALESCE($12, ligegyldig),
           tags = COALESCE($13, tags),
           form_data = COALESCE($14, form_data),
           is_flagged = COALESCE($15, is_flagged),
           is_resolved = CASE WHEN $20 THEN FALSE ELSE COALESCE($16, is_resolved) END,
           viewed = CASE WHEN $19 THEN FALSE ELSE viewed END,
           livechat_email = COALESCE($17, livechat_email),
           split_test_id = COALESCE($18, split_test_id),
           created_at = NOW()
       WHERE user_id = $1 AND chatbot_id = $2
       RETURNING *`,
      [user_id, chatbot_id, conversation_data, emne, score, customer_rating, lacking_info, bug_status, purchase_tracking_enabled, is_livechat, fallback, ligegyldig, tags, form_data, is_flagged, is_resolved, livechat_email, split_test_id, shouldMarkAsUnread, shouldMarkAsUnresolved]
    );

    if (updateResult.rows.length === 0) {
      const insertResult = await client.query(
        `INSERT INTO conversations
         (user_id, chatbot_id, conversation_data, emne, score, customer_rating, lacking_info, bug_status, purchase_tracking_enabled, is_livechat, fallback, ligegyldig, tags, form_data, is_flagged, is_resolved, viewed, livechat_email, split_test_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
         RETURNING *`,
        [user_id, chatbot_id, conversation_data, emne, score, customer_rating, lacking_info, bug_status, purchase_tracking_enabled, is_livechat, fallback, ligegyldig, tags, form_data, is_flagged, is_resolved || false, shouldMarkAsUnread ? false : null, livechat_email, split_test_id]
      );
      await client.query('COMMIT');
      return insertResult.rows[0];
    } else {
      await client.query('COMMIT');
      return updateResult.rows[0];
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Save context chunks for a specific conversation message
 */
export async function saveContextChunks(pool, conversationId, messageIndex, chunks) {
  if (!chunks || chunks.length === 0) return;
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Clear existing chunks for this message (in case of retry)
    await client.query(
      'DELETE FROM message_context_chunks WHERE conversation_id = $1 AND message_index = $2',
      [conversationId, messageIndex]
    );
    
    // Insert new chunks
    for (const chunk of chunks) {
      await client.query(
        `INSERT INTO message_context_chunks 
         (conversation_id, message_index, chunk_content, chunk_metadata, similarity_score)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          conversationId,
          messageIndex,
          chunk.pageContent || chunk.content || '',
          JSON.stringify(chunk.metadata || {}),
          chunk.score || null
        ]
      );
    }
    
    await client.query('COMMIT');
    console.log(`Saved ${chunks.length} context chunks for conversation ${conversationId}, message ${messageIndex}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving context chunks:', error);
  } finally {
    client.release();
  }
}

/**
 * Get context chunks for a specific conversation message
 */
export async function getContextChunks(pool, conversationId, messageIndex) {
  try {
    const result = await pool.query(
      `SELECT chunk_content, chunk_metadata, similarity_score 
       FROM message_context_chunks 
       WHERE conversation_id = $1 AND message_index = $2 
       ORDER BY similarity_score DESC NULLS LAST`,
      [conversationId, messageIndex]
    );
    return result.rows;
  } catch (error) {
    console.error('Error retrieving context chunks:', error);
    return [];
  }
}

/**
 * Ensure conversation update jobs table exists
 */
export async function ensureConversationUpdateJobsTable(pool) {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversation_update_jobs (
        id SERIAL PRIMARY KEY,
        chatbot_id TEXT NOT NULL,
        user_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        total_conversations INTEGER DEFAULT 0,
        processed_conversations INTEGER DEFAULT 0,
        successful_conversations INTEGER DEFAULT 0,
        failed_conversations INTEGER DEFAULT 0,
        limit_count INTEGER,
        error_message TEXT,
        progress_percentage INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Check if we need to alter the existing table to change user_id from INTEGER to TEXT
    const columnCheck = await pool.query(`
      SELECT data_type 
      FROM information_schema.columns 
      WHERE table_name = 'conversation_update_jobs' AND column_name = 'user_id'
    `);
    
    if (columnCheck.rows.length > 0 && columnCheck.rows[0].data_type === 'integer') {
      console.log('Migrating conversation_update_jobs.user_id from INTEGER to TEXT...');
      await pool.query('ALTER TABLE conversation_update_jobs ALTER COLUMN user_id TYPE TEXT');
      console.log('Successfully migrated user_id column to TEXT');
    }
    
    console.log('Conversation update jobs table ensured');
  } catch (error) {
    console.error('Error creating conversation update jobs table:', error);
  }
}

/**
 * Background job processor for conversation updates
 */
export async function processConversationUpdateJob(pool, jobId, chatbotId, userId, limit, totalConversations) {
  const client = await pool.connect();
  
  try {
    // Mark job as running
    await client.query(`
      UPDATE conversation_update_jobs 
      SET status = 'running', started_at = CURRENT_TIMESTAMP, last_updated = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [jobId]);

    console.log(`Starting background job ${jobId} for chatbot ${chatbotId} - ${totalConversations} conversations`);

    const BATCH_SIZE = 5; // Smaller batches for better reliability
    const CHUNK_SIZE = 100; // Process conversations in chunks to avoid memory issues
    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;
    let offset = 0;

    while (offset < totalConversations) {
      // Get a chunk of conversations
      let query = `
        SELECT id, conversation_data, user_id 
        FROM conversations
        WHERE chatbot_id = $1 
        ORDER BY created_at DESC 
        LIMIT $2 OFFSET $3
      `;
      let queryParams = [chatbotId, CHUNK_SIZE, offset];
      
      if (limit && limit > 0) {
        // If there's a limit, we need to adjust our approach
        const remainingFromLimit = Math.max(0, limit - offset);
        const currentChunkSize = Math.min(CHUNK_SIZE, remainingFromLimit);
        
        if (currentChunkSize <= 0) break;
        
        query = `
          SELECT id, conversation_data, user_id FROM (
            SELECT id, conversation_data, user_id, ROW_NUMBER() OVER (ORDER BY created_at DESC) as rn
            FROM conversations
            WHERE chatbot_id = $1
          ) ranked_conversations
          WHERE rn > $2 AND rn <= $3
        `;
        queryParams = [chatbotId, offset, offset + currentChunkSize];
      }

      const conversations = await client.query(query, queryParams);
      
      if (conversations.rows.length === 0) {
        break; // No more conversations to process
      }

      console.log(`Job ${jobId}: Processing chunk ${Math.floor(offset/CHUNK_SIZE) + 1} - ${conversations.rows.length} conversations`);

      // Process this chunk in smaller batches
      const batches = [];
      for (let i = 0; i < conversations.rows.length; i += BATCH_SIZE) {
        batches.push(conversations.rows.slice(i, i + BATCH_SIZE));
      }

      for (const batch of batches) {
        // Process batch with limited concurrency
        const batchPromises = batch.map(async (conversation) => {
          try {
            const conversationText = conversation.conversation_data;
            const { emne, score, lacking_info, fallback, tags } = await getEmneAndScore(conversationText, userId, chatbotId, pool);

            await client.query(
              `UPDATE conversations
               SET emne = $1, score = $2, lacking_info = $3, fallback = $4, tags = $5
               WHERE id = $6`,
              [emne, score, lacking_info, fallback, tags, conversation.id]
            );

            return { success: true, id: conversation.id };
          } catch (error) {
            console.error(`Job ${jobId}: Error processing conversation ${conversation.id}:`, error);
            return { success: false, id: conversation.id, error: error.message };
          }
        });

        // Wait for batch to complete
        const batchResults = await Promise.all(batchPromises);
        
        // Update counters
        for (const result of batchResults) {
          if (result.success) {
            successCount++;
          } else {
            errorCount++;
          }
        }
        
        processedCount += batch.length;

        // Update job progress in database
        const progressPercentage = Math.round((processedCount / totalConversations) * 100);
        await client.query(`
          UPDATE conversation_update_jobs 
          SET processed_conversations = $1, 
              successful_conversations = $2, 
              failed_conversations = $3,
              progress_percentage = $4,
              last_updated = CURRENT_TIMESTAMP
          WHERE id = $5
        `, [processedCount, successCount, errorCount, progressPercentage, jobId]);

        console.log(`Job ${jobId}: Progress ${processedCount}/${totalConversations} (${progressPercentage}%) - Success: ${successCount}, Errors: ${errorCount}`);

        // Small delay between batches to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      offset += conversations.rows.length;

      // Check if job was cancelled (you could add a cancel endpoint)
      const jobCheck = await client.query('SELECT status FROM conversation_update_jobs WHERE id = $1', [jobId]);
      if (jobCheck.rows[0]?.status === 'cancelled') {
        console.log(`Job ${jobId} was cancelled`);
        return;
      }
    }

    // Mark job as completed
    await client.query(`
      UPDATE conversation_update_jobs 
      SET status = 'completed', 
          completed_at = CURRENT_TIMESTAMP,
          last_updated = CURRENT_TIMESTAMP,
          progress_percentage = 100
      WHERE id = $1
    `, [jobId]);

    console.log(`Job ${jobId} completed: ${processedCount} processed, ${successCount} successful, ${errorCount} failed`);

  } catch (error) {
    console.error(`Job ${jobId} failed:`, error);
    
    // Mark job as failed
    await client.query(`
      UPDATE conversation_update_jobs 
      SET status = 'failed', 
          error_message = $1,
          completed_at = CURRENT_TIMESTAMP,
          last_updated = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [error.message, jobId]);
  } finally {
    client.release();
  }
}
