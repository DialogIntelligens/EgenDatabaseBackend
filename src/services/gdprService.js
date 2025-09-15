import { computeCutoffDate } from '../utils/gdprUtils.js';

export async function getGdprSettingsService(chatbotId, pool) {
  const result = await pool.query('SELECT * FROM gdpr_settings WHERE chatbot_id = $1', [chatbotId]);
  if (result.rows.length === 0) {
    return { chatbot_id: chatbotId, retention_days: 90, enabled: false, last_cleanup_run: null };
  }
  return result.rows[0];
}

export async function saveGdprSettingsService(chatbotId, retentionDays, enabled, pool) {
  const result = await pool.query(`
    INSERT INTO gdpr_settings (chatbot_id, retention_days, enabled, updated_at)
    VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
    ON CONFLICT (chatbot_id)
    DO UPDATE SET retention_days = EXCLUDED.retention_days,
                  enabled = EXCLUDED.enabled,
                  updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `, [chatbotId, retentionDays, enabled]);
  return result.rows[0];
}

export async function previewGdprCleanupService(chatbotId, retentionDays, pool) {
  const cutoffDate = computeCutoffDate(retentionDays);

  const conversationsResult = await pool.query(`
    SELECT 
      id,
      created_at,
      emne,
      CASE 
        WHEN conversation_data IS NOT NULL THEN jsonb_array_length(conversation_data)
        ELSE 0
      END as legacy_message_count,
      (SELECT COUNT(*) FROM conversation_messages WHERE conversation_id = conversations.id) as atomic_message_count
    FROM conversations 
    WHERE chatbot_id = $1 AND created_at < $2
    ORDER BY created_at DESC
    LIMIT 100
  `, [chatbotId, cutoffDate]);

  const totalCountsResult = await pool.query(`
    SELECT 
      COUNT(*) as total_conversations,
      COALESCE(SUM(
        CASE 
          WHEN conversation_data IS NOT NULL THEN jsonb_array_length(conversation_data)
          ELSE 0
        END
      ), 0) as total_legacy_messages,
      (SELECT COUNT(*) FROM conversation_messages cm 
       JOIN conversations c ON cm.conversation_id = c.id 
       WHERE c.chatbot_id = $1 AND c.created_at < $2) as total_atomic_messages,
      (SELECT COUNT(*) FROM message_context_chunks mcc
       JOIN conversations c ON mcc.conversation_id = c.id 
       WHERE c.chatbot_id = $1 AND c.created_at < $2) as total_context_chunks
    FROM conversations 
    WHERE chatbot_id = $1 AND created_at < $2
  `, [chatbotId, cutoffDate]);

  return {
    cutoff_date: cutoffDate,
    retention_days: retentionDays,
    sample_conversations: conversationsResult.rows,
    totals: totalCountsResult.rows[0]
  };
}

export async function executeGdprCleanupService(chatbotId, retentionDays, pool) {
  const client = await pool.connect();
  const cutoffDate = computeCutoffDate(retentionDays);

  try {
    await client.query('BEGIN');

    const conversationsResult = await client.query(`
      SELECT id FROM conversations 
      WHERE chatbot_id = $1 AND created_at < $2
    `, [chatbotId, cutoffDate]);

    const conversationIds = conversationsResult.rows.map(r => r.id);
    if (conversationIds.length === 0) {
      await client.query('COMMIT');
      return {
        success: true,
        processed_conversations: 0,
        anonymized_legacy_messages: 0,
        anonymized_atomic_messages: 0,
        anonymized_context_chunks: 0
      };
    }

    const conversationDataResult = await client.query(`
      UPDATE conversations 
      SET conversation_data = (
        SELECT jsonb_agg(
          CASE 
            WHEN jsonb_typeof(message) = 'object' THEN 
              message || jsonb_build_object(
                'text', '[DELETED FOR GDPR COMPLIANCE]',
                'image', null
              ) - 'imageData'
            ELSE 
              jsonb_build_object(
                'text', '[DELETED FOR GDPR COMPLIANCE]', 
                'isUser', false,
                'timestamp', extract(epoch from now()) * 1000
              )
          END
        )
        FROM jsonb_array_elements(conversation_data) AS message
      )
      WHERE id = ANY($1) AND conversation_data IS NOT NULL
      RETURNING id
    `, [conversationIds]);

    const atomicMessagesResult = await client.query(`
      UPDATE conversation_messages 
      SET 
        message_text = '[DELETED FOR GDPR COMPLIANCE]',
        image_data = null
      WHERE conversation_id = ANY($1)
      RETURNING id
    `, [conversationIds]);

    const contextChunksResult = await client.query(`
      UPDATE message_context_chunks 
      SET chunk_content = '[DELETED FOR GDPR COMPLIANCE]'
      WHERE conversation_id = ANY($1)
      RETURNING id
    `, [conversationIds]);

    await client.query(`
      UPDATE gdpr_settings 
      SET last_cleanup_run = CURRENT_TIMESTAMP 
      WHERE chatbot_id = $1
    `, [chatbotId]);

    await client.query('COMMIT');

    return {
      success: true,
      processed_conversations: conversationIds.length,
      anonymized_legacy_messages: conversationDataResult.rows.length,
      anonymized_atomic_messages: atomicMessagesResult.rows.length,
      anonymized_context_chunks: contextChunksResult.rows.length,
      cutoff_date: cutoffDate
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function runGdprCleanupAllService(pool) {
  const enabledClients = await pool.query(`
    SELECT chatbot_id, retention_days 
    FROM gdpr_settings 
    WHERE enabled = true
  `);

  const results = [];
  for (const row of enabledClients.rows) {
    try {
      const result = await executeGdprCleanupService(row.chatbot_id, row.retention_days, pool);
      results.push({ chatbot_id: row.chatbot_id, ...result });
    } catch (error) {
      results.push({ chatbot_id: row.chatbot_id, success: false, error: error.message });
    }
  }
  return results;
}


