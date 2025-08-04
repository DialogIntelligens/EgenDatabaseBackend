import express from 'express';

/* ================================
   Livechat Routes Module
   
   This module contains all livechat-related endpoints
   moved from index.js for better code organization.
================================ */

// Initialize the router with dependencies
function initializeLivechatRoutes(authenticateToken, pool) {
  const router = express.Router();

/* ================================
   Live Chat Statistics Endpoint
================================ */
router.get('/livechat-statistics', authenticateToken, async (req, res) => {
  const { chatbot_id, start_date, end_date } = req.query;

  if (!chatbot_id) {
    return res.status(400).json({ error: 'chatbot_id is required' });
  }

  try {
    // Check if the user has livechat access
    const userCheck = await pool.query(
      'SELECT livechat FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (userCheck.rows.length === 0 || !userCheck.rows[0].livechat) {
      return res.status(403).json({ error: 'User does not have livechat access' });
    }

    const chatbotIds = chatbot_id.split(',');

    // Build base query for livechat conversations
    let queryText = `
      SELECT *
      FROM conversations c
      WHERE c.chatbot_id = ANY($1) AND c.is_livechat = true
    `;
    let queryParams = [chatbotIds];
    let paramIndex = 2;

    // Add date filters if provided
    if (start_date && end_date) {
      queryText += ` AND c.created_at BETWEEN $${paramIndex++} AND $${paramIndex++}`;
      queryParams.push(start_date, end_date);
    }

    queryText += ` ORDER BY c.created_at DESC`;

    const conversationsResult = await pool.query(queryText, queryParams);

    // Get response time statistics from conversation_messages
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
    let responseTimeParams = [chatbotIds];
    let responseTimeParamIndex = 2;

    if (start_date && end_date) {
      responseTimeQuery += ` AND c.created_at BETWEEN $${responseTimeParamIndex++} AND $${responseTimeParamIndex++}`;
      responseTimeParams.push(start_date, end_date);
    }

    const responseTimeResult = await pool.query(responseTimeQuery, responseTimeParams);

    // Calculate daily conversation counts
    const dailyStats = {};
    conversationsResult.rows.forEach(conv => {
      const date = new Date(conv.created_at);
      const dayKey = `${date.getFullYear()}-${('0' + (date.getMonth() + 1)).slice(-2)}-${('0' + date.getDate()).slice(-2)}`;
      
      if (!dailyStats[dayKey]) {
        dailyStats[dayKey] = 0;
      }
      dailyStats[dayKey]++;
    });

    // Get total AI conversations for percentage calculation
    let aiConversationsQuery = `
      SELECT COUNT(*) as total_ai_conversations
      FROM conversations c
      WHERE c.chatbot_id = ANY($1) AND (c.is_livechat = false OR c.is_livechat IS NULL)
    `;
    let aiConversationsParams = [chatbotIds];
    let aiConversationsParamIndex = 2;

    if (start_date && end_date) {
      aiConversationsQuery += ` AND c.created_at BETWEEN $${aiConversationsParamIndex++} AND $${aiConversationsParamIndex++}`;
      aiConversationsParams.push(start_date, end_date);
    }

    const aiConversationsResult = await pool.query(aiConversationsQuery, aiConversationsParams);

    const totalLivechatConversations = conversationsResult.rows.length;
    const totalAiConversations = parseInt(aiConversationsResult.rows[0].total_ai_conversations);
    const totalConversations = totalLivechatConversations + totalAiConversations;

    // Calculate statistics
    const livechatPercentage = totalConversations > 0 
      ? ((totalLivechatConversations / totalConversations) * 100).toFixed(1)
      : '0.0';

    const avgResponseTime = responseTimeResult.rows[0].avg_response_time 
      ? Math.round(responseTimeResult.rows[0].avg_response_time)
      : null;

    const uniqueDays = Object.keys(dailyStats).length;
    const avgLivechatPerDay = uniqueDays > 0 
      ? (totalLivechatConversations / uniqueDays).toFixed(2)
      : '0.00';

    // Format daily data for charts
    const dailyData = Object.keys(dailyStats).length > 0 ? {
      labels: Object.keys(dailyStats).sort(),
      datasets: [{
        label: 'Daily Live Chat Conversations',
        data: Object.keys(dailyStats).sort().map(key => dailyStats[key]),
        fill: false,
        backgroundColor: '#FF6B6B',
        borderColor: '#FF5252',
        borderWidth: 2,
      }],
    } : null;

    res.json({
      totalLivechatConversations,
      avgLivechatPerDay,
      livechatPercentage: `${livechatPercentage}%`,
      avgResponseTime: avgResponseTime ? `${avgResponseTime}s` : 'N/A',
      minResponseTime: responseTimeResult.rows[0].min_response_time || null,
      maxResponseTime: responseTimeResult.rows[0].max_response_time || null,
      totalResponses: responseTimeResult.rows[0].total_responses || 0,
      dailyData,
      hasResponseTimeData: avgResponseTime !== null,
    });

  } catch (err) {
    console.error('Error retrieving livechat statistics:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

/* ================================
   Livechat Conversation Endpoints
================================ */

// Retrieve livechat conversation for widget polling
router.get('/livechat-conversation', async (req, res) => {
  const { user_id, chatbot_id } = req.query;

  if (!user_id || !chatbot_id) {
    return res.status(400).json({ error: 'user_id and chatbot_id are required' });
  }

  try {
    const result = await pool.query(
      `SELECT conversation_data FROM conversations
       WHERE user_id = $1 AND chatbot_id = $2 AND is_livechat = TRUE
       ORDER BY created_at DESC LIMIT 1`,
      [user_id, chatbot_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    let data = result.rows[0].conversation_data;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (e) {
        console.error('Error parsing conversation_data JSON:', e);
      }
    }

    res.json({ conversation_data: data });
  } catch (err) {
    console.error('Error fetching livechat conversation:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// GET livechat conversation with atomic message support
router.get('/livechat-conversation-atomic', async (req, res) => {
  const { user_id, chatbot_id } = req.query;

  if (!user_id || !chatbot_id) {
    return res.status(400).json({ 
      error: 'Missing required parameters: user_id, chatbot_id' 
    });
  }

  try {
    // Check if conversation exists and uses message system
    const convCheck = await pool.query(`
      SELECT id, uses_message_system FROM conversations 
      WHERE user_id = $1 AND chatbot_id = $2
    `, [user_id, chatbot_id]);

    if (convCheck.rows.length === 0) {
      return res.json({ conversation_data: [] });
    }

    const conversation = convCheck.rows[0];
    
    if (conversation.uses_message_system) {
      // Use atomic message system
      const result = await pool.query(`
        SELECT * FROM get_conversation_messages($1, $2)
      `, [user_id, chatbot_id]);

      const messages = result.rows.map(row => ({
        text: row.message_text,
        isUser: row.is_user,
        isSystem: row.is_system,
        isForm: row.is_form,
        agentName: row.agent_name,
        profilePicture: row.profile_picture,
        image: row.image_data,
        messageType: row.message_type,
        sequenceNumber: row.sequence_number,
        createdAt: row.created_at,
        // Include file metadata from metadata field
        fileName: row.metadata?.fileName,
        fileMime: row.metadata?.fileMime,
        // Restore original properties from metadata
        textWithMarkers: row.text_with_markers || row.message_text,
        isError: row.is_error || false,
        // Include any other properties stored in metadata
        ...((row.metadata && row.metadata.originalProperties) || {})
      }));

      res.json({ conversation_data: messages });
    } else {
      // Fall back to original system
      const result = await pool.query(`
        SELECT conversation_data FROM conversations 
        WHERE user_id = $1 AND chatbot_id = $2
      `, [user_id, chatbot_id]);

      res.json({ 
        conversation_data: result.rows[0]?.conversation_data || [] 
      });
    }

  } catch (error) {
    console.error('Error fetching atomic livechat conversation:', error);
    res.status(500).json({ 
      error: 'Database error', 
      details: error.message 
    });
  }
});

/* ================================
   Support Status Endpoints
================================ */

// Get support status for a specific chatbot
router.get('/support-status/:chatbot_id', async (req, res) => {
  const { chatbot_id } = req.params;

  if (!chatbot_id) {
    return res.status(400).json({ error: 'chatbot_id is required' });
  }

  try {
    // Get all users with livechat enabled for this chatbot
    const result = await pool.query(
      `SELECT ss.user_id, ss.is_live, u.username 
       FROM support_status ss
       JOIN users u ON ss.user_id = u.id
       WHERE ss.chatbot_id = $1 AND u.livechat = true`,
      [chatbot_id]
    );

    // Check if any support agent is live
    const isAnyAgentLive = result.rows.some(row => row.is_live);

    res.json({ 
      support_available: isAnyAgentLive,
      agents: result.rows
    });
  } catch (err) {
    console.error('Error fetching support status:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// Update support status for a user
router.post('/support-status', authenticateToken, async (req, res) => {
  const { chatbot_id, is_live } = req.body;
  const user_id = req.user.userId;

  if (!chatbot_id || typeof is_live !== 'boolean') {
    return res.status(400).json({ error: 'chatbot_id and is_live (boolean) are required' });
  }

  try {
    // Check if user has livechat enabled
    const userCheck = await pool.query(
      'SELECT livechat FROM users WHERE id = $1',
      [user_id]
    );

    if (userCheck.rows.length === 0 || !userCheck.rows[0].livechat) {
      return res.status(403).json({ error: 'User does not have livechat access' });
    }

    // Update or insert support status
    const result = await pool.query(
      `INSERT INTO support_status (user_id, chatbot_id, is_live, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, chatbot_id)
       DO UPDATE SET is_live = $3, updated_at = NOW()
       RETURNING *`,
      [user_id, chatbot_id, is_live]
    );

    res.json({ 
      message: 'Support status updated successfully',
      support_status: result.rows[0]
    });
  } catch (err) {
    console.error('Error updating support status:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

/* ================================
   Individual Livechat Messages Endpoints
================================ */

// POST endpoint to save individual livechat messages
router.post('/livechat-message', async (req, res) => {
  const {
    user_id,
    chatbot_id,
    message_id,
    text,
    is_user,
    is_system = false,
    timestamp,
    image_data,
    image_name,
    image_mime,
    agent_id,
    agent_name,
    agent_profile_picture
  } = req.body;

  if (!user_id || !chatbot_id || !message_id || !text) {
    return res.status(400).json({ 
      error: 'Missing required fields: user_id, chatbot_id, message_id, text' 
    });
  }

  try {
    const result = await pool.query(`
      INSERT INTO livechat_messages (
        user_id, chatbot_id, message_id, text, is_user, is_system, 
        timestamp, image_data, image_name, image_mime, 
        agent_id, agent_name, agent_profile_picture, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
      ON CONFLICT (message_id) DO UPDATE SET
        text = EXCLUDED.text,
        timestamp = EXCLUDED.timestamp,
        image_data = EXCLUDED.image_data,
        image_name = EXCLUDED.image_name,
        image_mime = EXCLUDED.image_mime,
        updated_at = NOW()
      RETURNING *`,
      [
        user_id, chatbot_id, message_id, text, is_user, is_system,
        new Date(timestamp), image_data, image_name, image_mime,
        agent_id, agent_name, agent_profile_picture
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error saving livechat message:', err);
    res.status(500).json({
      error: 'Database error',
      details: err.message
    });
  }
});

// GET endpoint to fetch livechat messages for a conversation
router.get('/livechat-messages', async (req, res) => {
  const { user_id, chatbot_id, since_timestamp } = req.query;

  if (!user_id || !chatbot_id) {
    return res.status(400).json({ 
      error: 'user_id and chatbot_id are required' 
    });
  }

  try {
    let query = `
      SELECT * FROM livechat_messages
      WHERE user_id = $1 AND chatbot_id = $2
    `;
    let params = [user_id, chatbot_id];

    // Optional: only fetch messages since a certain timestamp
    if (since_timestamp) {
      query += ` AND timestamp > $3`;
      params.push(new Date(parseInt(since_timestamp)));
    }

    query += ` ORDER BY timestamp ASC`;

    const result = await pool.query(query, params);

    res.json({ 
      messages: result.rows.map(row => ({
        ...row,
        tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags
      }))
    });
  } catch (err) {
    console.error('Error fetching livechat messages:', err);
    res.status(500).json({
      error: 'Database error',
      details: err.message
    });
  }
});

// PATCH endpoint to update message statistics
router.patch('/livechat-message/:messageId/stats', async (req, res) => {
  const { messageId } = req.params;
  const { emne, score, lacking_info, fallback, tags } = req.body;

  try {
    const result = await pool.query(`
      UPDATE livechat_messages 
      SET emne = $2, score = $3, lacking_info = $4, fallback = $5, tags = $6, updated_at = NOW()
      WHERE message_id = $1
      RETURNING *`,
      [messageId, emne, score, lacking_info, fallback, JSON.stringify(tags)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating message stats:', err);
    res.status(500).json({
      error: 'Database error',
      details: err.message
    });
  }
});

/* ================================
   Atomic Livechat Message Endpoints
================================ */

// POST append single message atomically
router.post('/append-livechat-message', async (req, res) => {
  const {
    user_id,
    chatbot_id,
    message_text,
    is_user,
    agent_name,
    profile_picture,
    image_data,
    message_type = 'text',
    is_system = false,
    is_form = false,
    metadata = {}
  } = req.body;

  if (!user_id || !chatbot_id || !message_text || typeof is_user !== 'boolean') {
    return res.status(400).json({ 
      error: 'Missing required fields: user_id, chatbot_id, message_text, is_user' 
    });
  }

  try {
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
      JSON.stringify(metadata)
    ]);

    const messageResult = result.rows[0];
    
    if (!messageResult.success) {
      return res.status(500).json({ 
        error: 'Failed to append message',
        details: messageResult.error_message 
      });
    }

    // Mark conversation as using the new message system
    await pool.query(`
      UPDATE conversations 
      SET uses_message_system = true,
          is_livechat = true
      WHERE id = $1
    `, [messageResult.conversation_id]);

    // Calculate response time if this is an agent message responding to a user message
    if (!is_user && agent_name) {
      try {
        // Find the most recent user message in this conversation
        const userMessageResult = await pool.query(`
          SELECT created_at 
          FROM conversation_messages 
          WHERE conversation_id = $1 AND is_user = true
          ORDER BY sequence_number DESC 
          LIMIT 1
        `, [messageResult.conversation_id]);

        if (userMessageResult.rows.length > 0) {
          const userMessageTime = new Date(userMessageResult.rows[0].created_at);
          const agentMessageTime = new Date(); // Current time (when agent responded)
          const responseTimeSeconds = Math.round((agentMessageTime - userMessageTime) / 1000);

          // Update the agent message with response time
          await pool.query(`
            UPDATE conversation_messages 
            SET response_time_seconds = $1 
            WHERE id = $2
          `, [responseTimeSeconds, messageResult.message_id]);

          console.log(`Calculated response time: ${responseTimeSeconds} seconds for message ${messageResult.message_id}`);
        }
      } catch (responseTimeError) {
        console.error('Error calculating response time:', responseTimeError);
        // Don't fail the request if response time calculation fails
      }
    }

    res.status(201).json({
      success: true,
      message_id: messageResult.message_id,
      conversation_id: messageResult.conversation_id,
      sequence_number: messageResult.sequence_number
    });

  } catch (error) {
    console.error('Error appending livechat message:', error);
    res.status(500).json({ 
      error: 'Database error', 
      details: error.message 
    });
  }
});

/* ================================
   Agent Typing Status Endpoints
================================ */

// POST agent typing status
router.post('/agent-typing-status', async (req, res) => {
  const { user_id, chatbot_id, agent_name, profile_picture, is_typing } = req.body;

  if (!user_id || !chatbot_id || !agent_name) {
    return res.status(400).json({ 
      error: 'Missing required parameters: user_id, chatbot_id, agent_name' 
    });
  }

  try {
    // Use upsert to handle concurrent updates
    const result = await pool.query(`
      INSERT INTO agent_typing_status (user_id, chatbot_id, agent_name, profile_picture, is_typing, last_updated)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (user_id, chatbot_id)
      DO UPDATE SET 
        agent_name = EXCLUDED.agent_name,
        profile_picture = EXCLUDED.profile_picture,
        is_typing = EXCLUDED.is_typing,
        last_updated = NOW()
      RETURNING *
    `, [user_id, chatbot_id, agent_name, profile_picture || '', is_typing]);

    res.json({ success: true, typing_status: result.rows[0] });
  } catch (error) {
    console.error('Error updating agent typing status:', error);
    res.status(500).json({ 
      error: 'Database error', 
      details: error.message 
    });
  }
});

// GET agent typing status
router.get('/agent-typing-status', async (req, res) => {
  const { user_id, chatbot_id } = req.query;

  if (!user_id || !chatbot_id) {
    return res.status(400).json({ 
      error: 'Missing required parameters: user_id, chatbot_id' 
    });
  }

  try {
    // Get current typing status, excluding expired ones (older than 10 seconds)
    const result = await pool.query(`
      SELECT * FROM agent_typing_status 
      WHERE user_id = $1 
        AND chatbot_id = $2 
        AND is_typing = true 
        AND last_updated > NOW() - INTERVAL '15 seconds'
    `, [user_id, chatbot_id]);

    const isAgentTyping = result.rows.length > 0;
    const agentInfo = isAgentTyping ? result.rows[0] : null;

    res.json({ 
      is_agent_typing: isAgentTyping,
      agent_name: agentInfo?.agent_name || null,
      profile_picture: agentInfo?.profile_picture || null
    });
  } catch (error) {
    console.error('Error fetching agent typing status:', error);
    res.status(500).json({ 
      error: 'Database error', 
      details: error.message 
    });
  }
});

/* ================================
   Livechat Notification Sound Endpoints
================================ */

// GET user's livechat notification sound preference
router.get('/livechat-notification-sound', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  
  try {
    const result = await pool.query(
      'SELECT livechat_notification_sound FROM users WHERE id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const soundEnabled = result.rows[0].livechat_notification_sound !== false; // Default to true if null
    res.json({ livechat_notification_sound: soundEnabled });
  } catch (err) {
    console.error('Error fetching livechat notification sound preference:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// PUT update user's livechat notification sound preference
router.put('/livechat-notification-sound', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { livechat_notification_sound } = req.body;
  
  if (typeof livechat_notification_sound !== 'boolean') {
    return res.status(400).json({ error: 'livechat_notification_sound must be a boolean' });
  }
  
  try {
    const result = await pool.query(
      'UPDATE users SET livechat_notification_sound = $2 WHERE id = $1 RETURNING livechat_notification_sound',
      [userId, livechat_notification_sound]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ 
      message: 'Livechat notification sound preference updated successfully',
      livechat_notification_sound: result.rows[0].livechat_notification_sound 
    });
  } catch (err) {
    console.error('Error updating livechat notification sound preference:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

/* ================================
   Additional Support Status and Count Endpoints
================================ */

// GET user's own support status
router.get('/my-support-status', authenticateToken, async (req, res) => {
  const user_id = req.user.userId;

  try {
    // Check if user has livechat enabled
    const userCheck = await pool.query(
      'SELECT livechat, chatbot_ids FROM users WHERE id = $1',
      [user_id]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!userCheck.rows[0].livechat) {
      return res.status(403).json({ error: 'User does not have livechat access' });
    }

    const result = await pool.query(
      'SELECT * FROM support_status WHERE user_id = $1',
      [user_id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching user support status:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// GET unread livechat conversation count
router.get('/unread-livechat-count', authenticateToken, async (req, res) => {
  const { chatbot_id } = req.query;
  
  if (!chatbot_id) {
    return res.status(400).json({ error: 'chatbot_id is required' });
  }

  try {
    const chatbotIds = chatbot_id.split(',');
    const userId = req.user.userId;

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
    
    res.json({ unread_livechat_count: unreadLivechatCount });
  } catch (err) {
    console.error('Error fetching unread livechat count:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

  return router;
}

export { initializeLivechatRoutes };