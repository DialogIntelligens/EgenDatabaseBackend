import { mapDbMessagesToFrontend, enhanceMetadata } from '../utils/livechatUtils.js';

export async function appendLivechatMessageService(body, pool) {
  const {
    user_id,
    chatbot_id,
    message_text,
    is_user,
    agent_name,
    profile_picture,
    image_data,
    file_name,
    file_mime,
    file_size,
    message_type = 'text',
    is_system = false,
    is_form = false,
    metadata = {}
  } = body;

  if (!user_id || !chatbot_id || !message_text || typeof is_user !== 'boolean') {
    throw new Error('Missing required fields: user_id, chatbot_id, message_text, is_user');
  }

  const enhancedMetadata = enhanceMetadata({ metadata, file_name, file_mime, file_size });

  const result = await pool.query(`
    SELECT * FROM append_message_atomic($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  `, [
    user_id,
    chatbot_id, 
    message_text,
    is_user,
    agent_name,
    profile_picture,
    image_data,
    message_type,
    is_system,
    is_form,
    JSON.stringify(enhancedMetadata)
  ]);

  const messageResult = result.rows[0];
  if (!messageResult?.success) {
    throw new Error(messageResult?.error_message || 'Failed to append message');
  }

  // Mark conversation as using message system and livechat
  await pool.query(`
    UPDATE conversations 
    SET uses_message_system = true,
        is_livechat = true
    WHERE id = $1
  `, [messageResult.conversation_id]);

  // Compute response time when agent replies
  if (!is_user && agent_name) {
    try {
      const userMessageResult = await pool.query(`
        SELECT created_at 
        FROM conversation_messages 
        WHERE conversation_id = $1 AND is_user = true
        ORDER BY sequence_number DESC 
        LIMIT 1
      `, [messageResult.conversation_id]);

      if (userMessageResult.rows.length > 0) {
        const userMessageTime = new Date(userMessageResult.rows[0].created_at);
        const agentMessageTime = new Date();
        const responseTimeSeconds = Math.round((agentMessageTime - userMessageTime) / 1000);
        await pool.query(`
          UPDATE conversation_messages 
          SET response_time_seconds = $1 
          WHERE id = $2
        `, [responseTimeSeconds, messageResult.message_id]);
      }
    } catch (e) {
      // non-fatal
    }
  }

  return {
    success: true,
    message_id: messageResult.message_id,
    conversation_id: messageResult.conversation_id,
    sequence_number: messageResult.sequence_number
  };
}

export async function getConversationMessagesService(query, pool) {
  const { user_id, chatbot_id } = query;
  if (!user_id || !chatbot_id) throw new Error('user_id and chatbot_id are required');

  const result = await pool.query(`
    SELECT * FROM get_conversation_messages($1, $2)
  `, [user_id, chatbot_id]);

  const messages = mapDbMessagesToFrontend(result.rows);
  return { conversation_data: messages, message_count: messages.length };
}

export async function migrateConversationWithMessagesService(body, pool) {
  const { user_id, chatbot_id, conversation_data } = body;
  if (!user_id || !chatbot_id || !conversation_data) throw new Error('user_id, chatbot_id, conversation_data required');
  if (!Array.isArray(conversation_data)) throw new Error('conversation_data must be an array');

  // get or create conversation
  const conv = await pool.query(`
    SELECT id FROM conversations WHERE user_id = $1 AND chatbot_id = $2
  `, [user_id, chatbot_id]);
  let conversationId = conv.rows[0]?.id;
  if (!conversationId) {
    const created = await pool.query(`
      INSERT INTO conversations (user_id, chatbot_id, conversation_data, is_livechat, uses_message_system)
      VALUES ($1, $2, $3, true, true) RETURNING id
    `, [user_id, chatbot_id, JSON.stringify(conversation_data)]);
    conversationId = created.rows[0].id;
  }

  await pool.query('DELETE FROM conversation_messages WHERE conversation_id = $1', [conversationId]);

  for (let i = 0; i < conversation_data.length; i++) {
    const msg = conversation_data[i];
    await pool.query(`
      INSERT INTO conversation_messages (
        conversation_id, user_id, chatbot_id, message_text, is_user,
        agent_name, profile_picture, image_data, sequence_number,
        message_type, is_system, is_form, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      conversationId,
      user_id,
      chatbot_id,
      msg.text || msg.content || '',
      Boolean(msg.isUser),
      msg.agentName || msg.agent_name || null,
      msg.profilePicture || msg.profile_picture || null,
      msg.image || msg.image_data || null,
      i + 1,
      msg.messageType || msg.message_type || (msg.image ? 'image' : 'text'),
      Boolean(msg.isSystem || msg.is_system),
      Boolean(msg.isForm || msg.is_form),
      JSON.stringify({
        textWithMarkers: msg.textWithMarkers,
        isError: msg.isError,
        ...(msg.metadata || {})
      })
    ]);
  }

  await pool.query(`
    UPDATE conversations 
    SET uses_message_system = true,
        is_livechat = true,
        conversation_data = $2
    WHERE id = $1
  `, [conversationId, JSON.stringify(conversation_data)]);

  return { success: true, message: 'Conversation migrated', migrated_messages: conversation_data.length, conversation_id: conversationId };
}

export async function getLivechatConversationAtomicService(query, pool) {
  const { user_id, chatbot_id } = query;
  if (!user_id || !chatbot_id) throw new Error('user_id and chatbot_id are required');

  const convCheck = await pool.query(`
    SELECT id, uses_message_system FROM conversations WHERE user_id = $1 AND chatbot_id = $2
  `, [user_id, chatbot_id]);

  if (convCheck.rows.length === 0) return { conversation_data: [] };

  if (convCheck.rows[0].uses_message_system) {
    const result = await pool.query('SELECT * FROM get_conversation_messages($1, $2)', [user_id, chatbot_id]);
    const messages = mapDbMessagesToFrontend(result.rows);
    return { conversation_data: messages };
  } else {
    const result = await pool.query('SELECT conversation_data FROM conversations WHERE user_id = $1 AND chatbot_id = $2', [user_id, chatbot_id]);
    return { conversation_data: result.rows[0]?.conversation_data || [] };
  }
}

export async function setAgentTypingStatusService(body, pool) {
  const { user_id, chatbot_id, agent_name, profile_picture, is_typing } = body;
  if (!user_id || !chatbot_id || !agent_name) throw new Error('user_id, chatbot_id, agent_name required');

  const result = await pool.query(`
    INSERT INTO agent_typing_status (user_id, chatbot_id, agent_name, profile_picture, is_typing, last_updated)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (user_id, chatbot_id)
    DO UPDATE SET agent_name = EXCLUDED.agent_name,
                  profile_picture = EXCLUDED.profile_picture,
                  is_typing = EXCLUDED.is_typing,
                  last_updated = NOW()
    RETURNING *
  `, [user_id, chatbot_id, agent_name, profile_picture || '', is_typing]);

  return { success: true, typing_status: result.rows[0] };
}

export async function getAgentTypingStatusService(query, pool) {
  const { user_id, chatbot_id } = query;
  if (!user_id || !chatbot_id) throw new Error('user_id and chatbot_id required');

  const result = await pool.query(`
    SELECT * FROM agent_typing_status 
    WHERE user_id = $1 AND chatbot_id = $2 
      AND is_typing = true 
      AND last_updated > NOW() - INTERVAL '15 seconds'
  `, [user_id, chatbot_id]);

  const isAgentTyping = result.rows.length > 0;
  const agentInfo = isAgentTyping ? result.rows[0] : null;
  return {
    is_agent_typing: isAgentTyping,
    agent_name: agentInfo?.agent_name || null,
    profile_picture: agentInfo?.profile_picture || null
  };
}

export async function getLivechatStatisticsService(query, pool, user) {
  const { chatbot_id, start_date, end_date } = query;
  if (!chatbot_id) throw new Error('chatbot_id is required');

  // check access
  const userCheck = await pool.query('SELECT livechat FROM users WHERE id = $1', [user.userId]);
  if (userCheck.rows.length === 0 || !userCheck.rows[0].livechat) {
    throw new Error('User does not have livechat access');
  }

  const chatbotIds = chatbot_id.split(',');

  let queryText = `
    SELECT *
    FROM conversations c
    WHERE c.chatbot_id = ANY($1) AND c.is_livechat = true
  `;
  const queryParams = [chatbotIds];
  let idx = 2;

  if (start_date && end_date) {
    queryText += ` AND c.created_at BETWEEN $${idx++} AND $${idx++}`;
    queryParams.push(start_date, end_date);
  }

  queryText += ' ORDER BY c.created_at DESC';
  const conversationsResult = await pool.query(queryText, queryParams);

  // response time stats
  let responseTimeQuery = `
    SELECT 
      AVG(cm.response_time_seconds) as avg_response_time,
      MIN(cm.response_time_seconds) as min_response_time,
      MAX(cm.response_time_seconds) as max_response_time,
      COUNT(cm.response_time_seconds) as total_responses
    FROM conversation_messages cm
    JOIN conversations c ON cm.conversation_id = c.id
    WHERE c.chatbot_id = ANY($1) 
      AND c.is_livechat = true 
      AND cm.response_time_seconds IS NOT NULL
      AND cm.agent_name IS NOT NULL
  `;
  const rtParams = [chatbotIds];
  let rtIdx = 2;
  if (start_date && end_date) {
    responseTimeQuery += ` AND c.created_at BETWEEN $${rtIdx++} AND $${rtIdx++}`;
    rtParams.push(start_date, end_date);
  }
  const responseTimeResult = await pool.query(responseTimeQuery, rtParams);

  // daily counts
  const dailyStats = {};
  conversationsResult.rows.forEach(conv => {
    const d = new Date(conv.created_at);
    const key = `${d.getFullYear()}-${('0' + (d.getMonth() + 1)).slice(-2)}-${('0' + d.getDate()).slice(-2)}`;
    dailyStats[key] = (dailyStats[key] || 0) + 1;
  });

  // AI conversations for ratio
  let aiQuery = `
    SELECT COUNT(*) as total_ai_conversations
    FROM conversations c
    WHERE c.chatbot_id = ANY($1) AND (c.is_livechat = false OR c.is_livechat IS NULL)
  `;
  const aiParams = [chatbotIds];
  let aiIdx = 2;
  if (start_date && end_date) {
    aiQuery += ` AND c.created_at BETWEEN $${aiIdx++} AND $${aiIdx++}`;
    aiParams.push(start_date, end_date);
  }
  const aiResult = await pool.query(aiQuery, aiParams);

  const totalLivechatConversations = conversationsResult.rows.length;
  const totalAiConversations = parseInt(aiResult.rows[0].total_ai_conversations || 0);
  const totalConversations = totalLivechatConversations + totalAiConversations;

  const livechatPercentage = totalConversations > 0
    ? `${(((totalLivechatConversations / totalConversations) * 100).toFixed(1))}%`
    : '0.0%';

  const avgResponseTime = responseTimeResult.rows[0].avg_response_time
    ? `${Math.round(responseTimeResult.rows[0].avg_response_time)}s`
    : 'N/A';

  const uniqueDays = Object.keys(dailyStats).length;
  const avgLivechatPerDay = uniqueDays > 0
    ? (totalLivechatConversations / uniqueDays).toFixed(2)
    : '0.00';

  const dailyData = Object.keys(dailyStats).length > 0 ? {
    labels: Object.keys(dailyStats).sort(),
    datasets: [{ label: 'Daily Live Chat Conversations', data: Object.keys(dailyStats).sort().map(k => dailyStats[k]) }]
  } : null;

  return {
    totalLivechatConversations,
    avgLivechatPerDay,
    livechatPercentage,
    avgResponseTime,
    minResponseTime: responseTimeResult.rows[0].min_response_time || null,
    maxResponseTime: responseTimeResult.rows[0].max_response_time || null,
    totalResponses: responseTimeResult.rows[0].total_responses || 0,
    dailyData,
    hasResponseTimeData: avgResponseTime !== 'N/A'
  };
}

export async function getPublicAverageResponseTimeService(params, pool) {
  const { chatbot_id } = params;
  if (!chatbot_id) throw new Error('chatbot_id is required');

  const responseTimeQuery = `
    SELECT 
      AVG(cm.response_time_seconds) as avg_response_time,
      COUNT(cm.response_time_seconds) as total_responses
    FROM conversation_messages cm
    JOIN conversations c ON cm.conversation_id = c.id
    WHERE c.chatbot_id = $1
      AND c.is_livechat = true 
      AND cm.response_time_seconds IS NOT NULL
      AND cm.agent_name IS NOT NULL
  `;
  const responseTimeResult = await pool.query(responseTimeQuery, [chatbot_id]);

  let avgResponseTime = 'N/A';
  let hasResponseTimeData = false;
  if (responseTimeResult.rows.length > 0 && responseTimeResult.rows[0].avg_response_time) {
    const avgSeconds = Math.round(responseTimeResult.rows[0].avg_response_time);
    if (avgSeconds < 60) avgResponseTime = `${avgSeconds}s`;
    else if (avgSeconds < 3600) avgResponseTime = `${Math.round(avgSeconds / 60)}m`;
    else avgResponseTime = `${Math.round(avgSeconds / 3600)}h`;
    hasResponseTimeData = true;
  }

  return {
    avgResponseTime,
    hasResponseTimeData,
    totalResponses: responseTimeResult.rows[0]?.total_responses || 0
  };
}


