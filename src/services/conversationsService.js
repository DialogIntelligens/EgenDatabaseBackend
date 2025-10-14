import jwt from 'jsonwebtoken';
import { upsertConversation, saveContextChunks, getContextChunks, ensureConversationUpdateJobsTable, processConversationUpdateJob } from '../utils/conversationsUtils.js';
import { getEmneAndScore } from '../utils/mainUtils.js';

/**
 * Create or update a conversation
 */
export async function createConversationService(body, headers, pool, SECRET_KEY) {
  let {
    conversation_data,
    user_id,
    chatbot_id,
    emne,
    score,
    customer_rating,
    lacking_info,
    bug_status,
    purchase_tracking_enabled,
    is_livechat,
    fallback,
    ligegyldig,
    tags,
    form_data,
    is_resolved,
    livechat_email,
    split_test_id
  } = body;

  const authHeader = headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const user = jwt.verify(token, SECRET_KEY);
      user_id = user.userId; // Override user_id if token is valid
    } catch (err) {
      // If token is invalid/expired, proceed but rely on user_id from body (if present)
      console.warn('Token verification failed, proceeding without authenticated user:', err.message);
    }
  }

  // Ensure user_id is present either from token or body
  if (!user_id) {
    throw new Error('Missing user_id and no valid authentication token provided');
  }
  if (!chatbot_id) {
    throw new Error('Missing chatbot_id');
  }

  // Fetch the correct purchase_tracking_enabled value from chatbot_settings
  // This ensures we always use the database value, regardless of frontend timing issues
  try {
    const settingsResult = await pool.query(
      'SELECT purchase_tracking_enabled FROM chatbot_settings WHERE chatbot_id = $1',
      [chatbot_id]
    );
    
    if (settingsResult.rows.length > 0) {
      const dbPurchaseTrackingEnabled = settingsResult.rows[0].purchase_tracking_enabled;
      if (dbPurchaseTrackingEnabled !== purchase_tracking_enabled) {
        console.log(`📊 Overriding purchase_tracking_enabled: frontend=${purchase_tracking_enabled}, database=${dbPurchaseTrackingEnabled}`);
        purchase_tracking_enabled = dbPurchaseTrackingEnabled;
      }
    }
  } catch (settingsError) {
    console.warn('Failed to fetch chatbot settings for purchase tracking, using frontend value:', settingsError.message);
  }

  // Stringify the conversation data (which now includes embedded source chunks)
  conversation_data = JSON.stringify(conversation_data);

  // Normalize is_livechat: only update when explicitly provided as boolean; otherwise leave unchanged (null)
  const normalizedIsLivechat = (typeof is_livechat === 'boolean') ? is_livechat : null;

  // Call upsertConversation with is_livechat, fallback, ligegyldig, tags, form_data, is_flagged, and is_resolved parameters
  const result = await upsertConversation(
    pool,
    user_id,
    chatbot_id,
    conversation_data, // This contains the embedded chunks
    emne,
    score,
    customer_rating,
    lacking_info,
    bug_status,
    purchase_tracking_enabled,
    normalizedIsLivechat,
    fallback,
    ligegyldig,
    tags,
    form_data,
    false, // is_flagged - default to false
    is_resolved || false, // is_resolved - default to false
    livechat_email,
    split_test_id
  );
  
  return result;
}

/**
 * Update conversation resolution status
 */
export async function updateConversationResolutionService(body, pool) {
  const { conversation_id, is_resolved } = body;

  if (!conversation_id || is_resolved === undefined) {
    throw new Error('conversation_id and is_resolved are required');
  }

  const result = await pool.query(
    'UPDATE conversations SET is_resolved = $1 WHERE id = $2 RETURNING *',
    [is_resolved, conversation_id]
  );

  if (result.rows.length === 0) {
    throw new Error('Conversation not found');
  }

  return result.rows[0];
}

/**
 * Delete conversations by user IDs
 */
export async function deleteConversationsService(body, pool) {
  const { userIds } = body;
  if (!userIds || userIds.length === 0) {
    throw new Error('userIds must be a non-empty array');
  }

  const result = await pool.query('DELETE FROM conversations WHERE user_id = ANY($1)', [userIds]);
  return { message: 'Conversations deleted successfully', result };
}

/**
 * Track chatbot open for greeting rate statistics
 */
export async function trackChatbotOpenService(body, pool) {
  const { chatbot_id, user_id } = body;
  
  if (!chatbot_id || !user_id) {
    throw new Error('chatbot_id and user_id are required');
  }

  // Check if this user+chatbot combination already exists (to avoid duplicates)
  const existingOpen = await pool.query(
    'SELECT id FROM chatbot_opens WHERE chatbot_id = $1 AND user_id = $2',
    [chatbot_id, user_id]
  );

  if (existingOpen.rows.length === 0) {
    // Insert new chatbot open record
    await pool.query(
      'INSERT INTO chatbot_opens (chatbot_id, user_id) VALUES ($1, $2)',
      [chatbot_id, user_id]
    );
    console.log(`Chatbot open tracked: ${chatbot_id} - ${user_id}`);
  }

  return { success: true };
}

/**
 * Get conversations with filters
 */
export async function getConversationsService(query, pool) {
  const { chatbot_id, lacking_info, start_date, end_date } = query;

  if (!chatbot_id) {
    throw new Error('chatbot_id is required');
  }

  // Convert comma-separated IDs into an array
  const chatbotIds = chatbot_id.split(',');

  let queryText = `
    SELECT c.*,
      -- Pre-calculate message counts using PostgreSQL JSON functions
      COALESCE((
        SELECT COUNT(*)
        FROM jsonb_array_elements(c.conversation_data::jsonb) as msg
        WHERE (msg->>'isUser')::boolean = true
      ), 0) as user_message_count,
      COALESCE(jsonb_array_length(c.conversation_data::jsonb), 0) as total_message_count
    FROM conversations c
    WHERE c.chatbot_id = ANY($1)
  `;
  let queryParams = [chatbotIds];
  let paramIndex = 2;

  if (lacking_info === 'true' || lacking_info === 'false') {
    queryText += ` AND c.lacking_info = $${paramIndex++}`;
    queryParams.push(lacking_info === 'true');
  }

  if (start_date && end_date) {
    queryText += ` AND c.created_at BETWEEN $${paramIndex++} AND $${paramIndex++}`;
    queryParams.push(start_date, end_date);
  }

  const result = await pool.query(queryText, queryParams);
  return result.rows;
}

/**
 * Get conversation count with filters
 */
export async function getConversationCountService(query, userId, pool) {
  const { chatbot_id, fejlstatus, customer_rating, emne, tags, is_resolved, has_purchase, conversation_filter } = query;
  if (!chatbot_id) {
    throw new Error('chatbot_id is required');
  }

  const chatbotIds = chatbot_id.split(',');

  let queryText = `
    SELECT COUNT(id) AS conversation_count
    FROM conversations c
    WHERE c.chatbot_id = ANY($1)
  `;
  let queryParams = [chatbotIds];
  let paramIndex = 2;

  if (fejlstatus && fejlstatus !== '') {
    if (fejlstatus === 'livechat') {
      queryText += ` AND c.is_livechat = TRUE`;
    } else if (fejlstatus === 'unread_comments') {
      queryText += ` AND EXISTS (
        SELECT 1 FROM conversation_comments cc
        WHERE cc.conversation_id = c.id
        AND NOT EXISTS (
          SELECT 1 FROM conversation_comment_views ccv
          WHERE ccv.comment_id = cc.id AND ccv.user_id = $${paramIndex++}
        )
      )`;
      queryParams.push(userId);
    } else if (fejlstatus === 'leads') {
      queryText += ` AND c.form_data->>'type' IN ('kontaktformular', 'kundeservice_formular')`;
    } else {
      queryText += ` AND c.bug_status = $${paramIndex++}`;
      queryParams.push(fejlstatus);
    }
  }
  if (has_purchase && has_purchase !== '') {
    if (has_purchase === 'true') {
      queryText += ` AND EXISTS (
        SELECT 1 FROM purchases p
        WHERE p.user_id = c.user_id AND p.chatbot_id = c.chatbot_id AND p.amount > 0
      )`;
    }
  }
  if (customer_rating && customer_rating !== '') {
    queryText += ` AND c.customer_rating = $${paramIndex++}`;
    queryParams.push(customer_rating);
  }
  if (emne && emne !== '') {
    queryText += ` AND c.emne = $${paramIndex++}`;
    queryParams.push(emne);
  }
  if (tags && tags !== '') {
    queryText += ` AND c.tags @> $${paramIndex++}::jsonb`;
    queryParams.push(JSON.stringify([tags]));
  }
  if (is_resolved && is_resolved !== '') {
    if (is_resolved === 'resolved') {
      queryText += ` AND c.is_resolved = TRUE`;
    } else if (is_resolved === 'unresolved') {
      queryText += ` AND (c.is_resolved = FALSE OR c.is_resolved IS NULL)`;
    }
  }
  if (conversation_filter && conversation_filter.trim() !== '') {
    // Search in both conversation ID and conversation data
    queryText += ` AND (c.id::text ILIKE '%' || $${paramIndex} || '%' OR c.conversation_data::text ILIKE '%' || $${paramIndex} || '%')`;
    queryParams.push(`${conversation_filter}`);
    console.log('🔍 Count Search Filter:', conversation_filter);
    console.log('🔍 Count Query:', queryText);
    console.log('🔍 Count Params:', queryParams);
    paramIndex++;
  }
  const result = await pool.query(queryText, queryParams);
  console.log('🔍 Count Result:', result.rows[0]?.conversation_count || 0);
  return result.rows;
}

/**
 * Get conversations metadata with filters and pagination
 */
export async function getConversationsMetadataService(query, userId, pool) {
  const { chatbot_id, page_number, page_size, lacking_info, start_date, end_date, conversation_filter, fejlstatus, customer_rating, emne, tags, is_resolved, is_livechat_page, has_purchase } = query;

  if (!chatbot_id) {
    throw new Error('chatbot_id is required');
  }

  const chatbotIds = chatbot_id.split(',');

  let queryText = `
    SELECT c.id, c.created_at, c.emne, c.customer_rating, c.bug_status, c.conversation_data, c.viewed, c.tags, c.is_flagged, c.form_data, c.user_id, c.livechat_email,
           COALESCE(SUM(p.amount), 0) as purchase_amount,
           CASE 
             WHEN EXISTS (
               SELECT 1 FROM conversation_comments cc
               WHERE cc.conversation_id = c.id
               AND NOT EXISTS (
                 SELECT 1 FROM conversation_comment_views ccv
                 WHERE ccv.comment_id = cc.id AND ccv.user_id = $2
               )
             ) THEN TRUE
             ELSE FALSE
           END as has_unread_comments,
           CASE 
             WHEN c.is_livechat = TRUE AND c.uses_message_system = TRUE THEN
               COALESCE(
                 (SELECT cm.created_at FROM conversation_messages cm 
                  WHERE cm.conversation_id = c.id 
                  AND (cm.is_system = TRUE OR cm.agent_name IS NOT NULL)
                  ORDER BY cm.sequence_number ASC 
                  LIMIT 1),
                 c.created_at
               )
             ELSE c.created_at
           END as sort_timestamp
    FROM conversations c
    LEFT JOIN purchases p ON c.user_id = p.user_id AND c.chatbot_id = p.chatbot_id
    WHERE c.chatbot_id = ANY($1)
  `;
  let queryParams = [chatbotIds, userId];
  let paramIndex = 3;

  if (lacking_info === 'true' || lacking_info === 'false') {
    queryText += ` AND c.lacking_info = $${paramIndex++}`;
    queryParams.push(lacking_info === 'true');
  }

  if (start_date && end_date) {
    queryText += ` AND c.created_at BETWEEN $${paramIndex++} AND $${paramIndex++}`;
    queryParams.push(start_date, end_date);
  }
  if (fejlstatus && fejlstatus !== '') {
    if (fejlstatus === 'livechat') {
      queryText += ` AND c.is_livechat = TRUE`;
    } else if (fejlstatus === 'unread_comments') {
      queryText += ` AND EXISTS (
        SELECT 1 FROM conversation_comments cc
        WHERE cc.conversation_id = c.id
        AND NOT EXISTS (
          SELECT 1 FROM conversation_comment_views ccv
          WHERE ccv.comment_id = cc.id AND ccv.user_id = $2
        )
      )`;
    } else if (fejlstatus === 'leads') {
      queryText += ` AND c.form_data->>'type' IN ('kontaktformular', 'kundeservice_formular')`;
    } else if (fejlstatus === 'flagged') {
      queryText += ` AND c.is_flagged = TRUE`;
    } else {
      queryText += ` AND c.bug_status = $${paramIndex++}`;
      queryParams.push(fejlstatus);
    }
  }
  if (has_purchase && has_purchase !== '') {
    if (has_purchase === 'true') {
      queryText += ` AND EXISTS (
        SELECT 1 FROM purchases p
        WHERE p.user_id = c.user_id AND p.chatbot_id = c.chatbot_id AND p.amount > 0
      )`;
    }
  }
  if (customer_rating && customer_rating !== '') {
    queryText += ` AND c.customer_rating = $${paramIndex++}`;
    queryParams.push(customer_rating);
  }
  if (emne && emne !== '') {
    queryText += ` AND c.emne = $${paramIndex++}`;
    queryParams.push(emne);
  }
  if (conversation_filter && conversation_filter.trim() !== '') {
    // Search in both conversation ID and conversation data
    queryText += ` AND (c.id::text ILIKE '%' || $${paramIndex} || '%' OR c.conversation_data::text ILIKE '%' || $${paramIndex} || '%')`;
    queryParams.push(`${conversation_filter}`);
    console.log('🔍 Metadata Search Filter:', conversation_filter);
    paramIndex++;
  }
  if (is_resolved && is_resolved !== '') {
    if (is_resolved === 'resolved') {
      queryText += ` AND c.is_resolved = TRUE`;
    } else if (is_resolved === 'unresolved') {
      queryText += ` AND (c.is_resolved = FALSE OR c.is_resolved IS NULL)`;
    }
  }

  queryText += ` GROUP BY c.id `;
  
  // Use different sorting logic for livechat page
  if (is_livechat_page === 'true') {
    // For livechat page: sort by first live message timestamp (when livechat started)
    queryText += ` ORDER BY sort_timestamp DESC `;
  } else {
    // For normal conversations page: sort by created_at (newest first)
    queryText += ` ORDER BY c.created_at DESC `;
  }
  
  queryText += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++} `;
  queryParams.push(page_size, page_number * page_size);

  const result = await pool.query(queryText, queryParams);
  return result.rows;
}

/**
 * Get single conversation by ID
 */
export async function getConversationByIdService(id, isAdmin, pool) {
  // Get the conversation with purchase data
  const result = await pool.query(
    `SELECT c.*, 
            COALESCE(SUM(p.amount), 0) as purchase_amount
     FROM conversations c
     LEFT JOIN purchases p ON c.user_id = p.user_id AND c.chatbot_id = p.chatbot_id
     WHERE c.id = $1
     GROUP BY c.id`, 
    [id]
  );
  
  if (result.rows.length === 0) {
    throw new Error('Conversation not found');
  }

  let conversation = result.rows[0];

  // If this is a livechat conversation, enrich with file metadata from atomic messages
  if (conversation.is_livechat) {
    try {
      // Read file metadata from atomic conversation_messages metadata JSONB
      const cmResult = await pool.query(
        `SELECT message_text, metadata
         FROM conversation_messages
         WHERE conversation_id = $1
         ORDER BY sequence_number ASC`,
        [conversation.id]
      );

      // Parse existing conversation data
      let conversationData = [];
      if (conversation.conversation_data) {
        try {
          conversationData = typeof conversation.conversation_data === 'string'
            ? JSON.parse(conversation.conversation_data)
            : conversation.conversation_data;
        } catch (e) {
          console.error('Error parsing conversation_data:', e);
          conversationData = [];
        }
      }

      // Enrich conversation data with file metadata from metadata field
      if (cmResult.rows.length > 0 && conversationData.length > 0) {
        const messageMap = new Map();
        cmResult.rows.forEach(row => {
          const meta = row.metadata || {};
          if (meta.fileName || meta.fileMime) {
            messageMap.set(row.message_text, {
              fileName: meta.fileName || null,
              fileMime: meta.fileMime || null
            });
          }
        });

        // Update conversation data with file metadata
        conversationData = conversationData.map(msg => {
          if (msg.image && msg.text && messageMap.has(msg.text)) {
            const fileMetadata = messageMap.get(msg.text);
            return {
              ...msg,
              fileName: fileMetadata.fileName,
              fileMime: fileMetadata.fileMime
            };
          }
          return msg;
        });

        conversation.conversation_data = conversationData;
      }
    } catch (error) {
      console.error('Error enriching livechat conversation with file metadata (atomic):', error);
      // Continue without enrichment if there's an error
    }
  }
  
  // Only mark the conversation as viewed if the user is not an admin
  if (!isAdmin) {
    await pool.query('UPDATE conversations SET viewed = TRUE WHERE id = $1', [id]);
  }
  
  return conversation;
}

/**
 * Mark conversation as unread
 */
export async function markConversationUnreadService(id, pool) {
  const result = await pool.query(
    'UPDATE conversations SET viewed = FALSE WHERE id = $1 RETURNING *', 
    [id]
  );
  
  if (result.rows.length === 0) {
    throw new Error('Conversation not found');
  }
  
  return result.rows[0];
}

/**
 * Flag/unflag conversation (only for livechat conversations)
 */
export async function flagConversationService(id, body, pool) {
  const { is_flagged } = body;
  
  // First verify this is a livechat conversation
  const checkResult = await pool.query(
    'SELECT is_livechat FROM conversations WHERE id = $1',
    [id]
  );
  
  if (checkResult.rows.length === 0) {
    throw new Error('Conversation not found');
  }
  
  if (!checkResult.rows[0].is_livechat) {
    throw new Error('Flagging is only available for livechat conversations');
  }
  
  // Update the flag status
  const result = await pool.query(
    'UPDATE conversations SET is_flagged = $1 WHERE id = $2 RETURNING *', 
    [is_flagged, id]
  );
  
  return result.rows[0];
}

/**
 * Update conversation subject (emne) and clear tags
 */
export async function updateConversationSubjectService(id, body, pool) {
  const { emne } = body;
  
  if (!emne || typeof emne !== 'string' || emne.trim() === '') {
    throw new Error('emne is required and must be a non-empty string');
  }

  // Update the conversation subject and clear tags
  const result = await pool.query(
    'UPDATE conversations SET emne = $1, tags = NULL WHERE id = $2 RETURNING *', 
    [emne.trim(), id]
  );
  
  if (result.rows.length === 0) {
    throw new Error('Conversation not found');
  }
  
  return result.rows[0];
}


/**
 * Update conversation (PATCH)
 */
export async function updateConversationService(id, body, pool) {
  const { bug_status, lacking_info } = body;

  if (bug_status === undefined && lacking_info === undefined) {
    throw new Error('At least one of bug_status or lacking_info must be provided');
  }

  const fields = [];
  const values = [];
  let idx = 1;

  if (bug_status !== undefined) {
    fields.push(`bug_status = $${idx++}`);
    values.push(bug_status);
  }
  if (lacking_info !== undefined) {
    fields.push(`lacking_info = $${idx++}`);
    values.push(lacking_info);
  }

  values.push(id);

  const query = `UPDATE conversations SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
  const result = await pool.query(query, values);
  if (result.rows.length === 0) {
    throw new Error('Conversation not found');
  }
  return result.rows[0];
}

/**
 * Delete conversation by ID
 */
export async function deleteConversationService(id, authenticatedUserId, isAdmin, pool) {
  // Load conversation to verify access
  const convResult = await pool.query(
    'SELECT id, chatbot_id FROM conversations WHERE id = $1',
    [id]
  );
  if (convResult.rows.length === 0) {
    throw new Error('Conversation not found');
  }

  const conversation = convResult.rows[0];

  if (!isAdmin) {
    // Non-admins can delete only conversations tied to chatbots they own
    const userResult = await pool.query(
      'SELECT chatbot_ids FROM users WHERE id = $1',
      [authenticatedUserId]
    );
    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }

    let chatbotIds = userResult.rows[0].chatbot_ids || [];
    if (typeof chatbotIds === 'string') {
      try { chatbotIds = JSON.parse(chatbotIds); } catch (_) { chatbotIds = []; }
    }

    const hasAccess = Array.isArray(chatbotIds) && chatbotIds.includes(conversation.chatbot_id);
    if (!hasAccess) {
      throw new Error('Forbidden: You do not have access to this conversation');
    }
  }

  // Delete conversation
  const result = await pool.query(
    'DELETE FROM conversations WHERE id = $1 RETURNING *',
    [id]
  );
  if (result.rows.length === 0) {
    throw new Error('Conversation not found');
  }
  return { message: 'Conversation deleted successfully', deleted: result.rows[0] };
}

/**
 * Start a conversation update job
 */
export async function startConversationUpdateJobService(body, pool) {
  const { chatbot_id, limit } = body;

  if (!chatbot_id) {
    throw new Error('chatbot_id is required');
  }

  // First, count total conversations to be processed
  let countQuery = 'SELECT COUNT(*) as total FROM conversations WHERE chatbot_id = $1';
  let countParams = [chatbot_id];
  
  if (limit && limit > 0) {
    countQuery = `
      SELECT COUNT(*) as total FROM (
        SELECT id FROM conversations
        WHERE chatbot_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      ) AS limited_conversations
    `;
    countParams.push(limit);
  }
  
  const countResult = await pool.query(countQuery, countParams);
  const totalConversations = parseInt(countResult.rows[0].total);
  
  if (totalConversations === 0) {
    throw new Error('No conversations found for the given chatbot_id');
  }

  // Get userId from a conversation
  const userResult = await pool.query(
    'SELECT user_id FROM conversations WHERE chatbot_id = $1 LIMIT 1',
    [chatbot_id]
  );
  
  if (userResult.rows.length === 0) {
    throw new Error('No conversations found for the given chatbot_id');
  }
  
  const userId = userResult.rows[0].user_id;

  // Create a new job record
  const jobResult = await pool.query(`
    INSERT INTO conversation_update_jobs 
    (chatbot_id, user_id, total_conversations, limit_count, status)
    VALUES ($1, $2, $3, $4, 'pending')
    RETURNING id
  `, [chatbot_id, userId, totalConversations, limit || null]);

  const jobId = jobResult.rows[0].id;

  // Start processing the job in the background
  processConversationUpdateJob(pool, jobId, chatbot_id, userId, limit, totalConversations);

  return {
    job_id: jobId,
    message: 'Conversation update job started',
    total_conversations: totalConversations,
    status: 'pending'
  };
}

/**
 * Get conversation update job status
 */
export async function getConversationUpdateJobService(jobId, pool) {
  const result = await pool.query(
    'SELECT * FROM conversation_update_jobs WHERE id = $1',
    [jobId]
  );

  if (result.rows.length === 0) {
    throw new Error('Job not found');
  }

  const job = result.rows[0];
  
  // Calculate progress percentage if not set
  if (job.total_conversations > 0 && job.progress_percentage === 0 && job.processed_conversations > 0) {
    job.progress_percentage = Math.round((job.processed_conversations / job.total_conversations) * 100);
  }

  return job;
}

/**
 * Get context chunks for a conversation message
 */
export async function getContextChunksService(conversationId, messageIndex, pool) {
  const chunks = await getContextChunks(pool, conversationId, parseInt(messageIndex));
  return chunks;
}

/**
 * Save context chunks for a conversation message
 */
export async function saveContextChunksService(conversationId, messageIndex, body, pool) {
  const { chunks } = body;
  await saveContextChunks(pool, conversationId, parseInt(messageIndex), chunks);
  return { message: 'Context chunks saved successfully' };
}

/**
 * Get unread comments count
 */
export async function getUnreadCommentsCountService(query, userId, pool) {
  const { chatbot_id } = query;
  
  if (!chatbot_id) {
    throw new Error('chatbot_id is required');
  }

  const chatbotIds = chatbot_id.split(',');

  // Count distinct conversations that have unread comments for this user
  // Only for conversations belonging to the user's chatbots
  const queryText = `
    SELECT COUNT(DISTINCT c.id) AS unread_conversations_count
    FROM conversations c
    WHERE c.chatbot_id = ANY($1)
    AND EXISTS (
      SELECT 1 FROM conversation_comments cc
      WHERE cc.conversation_id = c.id
      AND NOT EXISTS (
        SELECT 1 FROM conversation_comment_views ccv
        WHERE ccv.comment_id = cc.id AND ccv.user_id = $2
      )
    )
  `;
  
  const result = await pool.query(queryText, [chatbotIds, userId]);
  const unreadConversationsCount = parseInt(result.rows[0]?.unread_conversations_count || 0);
  
  return { unread_comments_count: unreadConversationsCount };
}

/**
 * Get leads count
 */
export async function getLeadsCountService(query, pool) {
  const { chatbot_id } = query;
  
  if (!chatbot_id) {
    throw new Error('chatbot_id is required');
  }

  const chatbotIds = chatbot_id.split(',');

  // Count conversations that have form submissions (leads)
  const queryText = `
    SELECT COUNT(DISTINCT c.id) AS leads_count
    FROM conversations c
    WHERE c.chatbot_id = ANY($1)
    AND c.form_data->>'type' IN ('kontaktformular', 'kundeservice_formular')
  `;
  
  const result = await pool.query(queryText, [chatbotIds]);
  const leadsCount = parseInt(result.rows[0]?.leads_count || 0);
  
  return { leads_count: leadsCount };
}

/**
 * Get unread livechat count
 */
export async function getUnreadLivechatCountService(query, pool) {
  const { chatbot_id } = query;
  
  if (!chatbot_id) {
    throw new Error('chatbot_id is required');
  }

  const chatbotIds = chatbot_id.split(',');

  // Count livechat conversations that are unread (viewed = false) for this user's chatbots
  const queryText = `
    SELECT COUNT(c.id) AS unread_livechat_count
    FROM conversations c
    WHERE c.chatbot_id = ANY($1)
    AND c.is_livechat = TRUE
    AND (c.viewed = FALSE OR c.viewed IS NULL)
  `;
  
  const result = await pool.query(queryText, [chatbotIds]);
  const unreadLivechatCount = parseInt(result.rows[0]?.unread_livechat_count || 0);
  
  return { unread_livechat_count: unreadLivechatCount };
}

/**
 * Get conversations for export with specific fields
 */
export async function getConversationsForExportService(query, pool) {
  const { chatbot_id, start_date, end_date, emne } = query;

  if (!chatbot_id) {
    throw new Error('chatbot_id is required');
  }

  // Convert comma-separated IDs into an array
  const chatbotIds = chatbot_id.split(',');

  let queryText = `
    SELECT 
      c.id,
      c.user_id,
      c.chatbot_id,
      c.emne,
      c.tags,
      c.fallback,
      c.customer_rating,
      c.conversation_data,
      c.created_at
    FROM conversations c
    WHERE c.chatbot_id = ANY($1)
  `;
  let queryParams = [chatbotIds];
  let paramIndex = 2;

  // Add date range filter if provided
  if (start_date && end_date) {
    queryText += ` AND c.created_at BETWEEN $${paramIndex++} AND $${paramIndex++}`;
    queryParams.push(start_date, end_date);
  }

  // Add emne (topic) filter if provided and not 'all'
  if (emne && emne !== 'all') {
    queryText += ` AND c.emne = $${paramIndex++}`;
    queryParams.push(emne);
  }

  // Order by created_at descending
  queryText += ` ORDER BY c.created_at DESC`;

  const result = await pool.query(queryText, queryParams);
  return result.rows;
}