// New endpoints for separate livechat message storage
// Add these to your backend/index.js

// POST endpoint to save individual livechat messages
app.post('/livechat-message', async (req, res) => {
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

// PATCH endpoint to update message statistics
app.patch('/livechat-message/:messageId/stats', async (req, res) => {
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

// GET endpoint to fetch livechat messages for a conversation
app.get('/livechat-messages', async (req, res) => {
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

// GET endpoint for dashboard to fetch livechat conversations (replaces conversations-metadata for livechat)
app.get('/livechat-conversations-metadata', authenticateToken, async (req, res) => {
  const { chatbot_id, page_number = 0, page_size = 10, conversation_filter, emne, tags } = req.query;
  const offset = page_number * page_size;

  if (!chatbot_id) {
    return res.status(400).json({ error: 'chatbot_id is required' });
  }

  try {
    const chatbotIds = chatbot_id.split(',');
    
    let queryText = `
      SELECT 
        ROW_NUMBER() OVER (ORDER BY MAX(lm.timestamp) DESC) as id,
        lm.user_id,
        lm.chatbot_id,
        COUNT(*) as message_count,
        MAX(lm.timestamp) as created_at,
        STRING_AGG(DISTINCT lm.emne, ', ') FILTER (WHERE lm.emne IS NOT NULL) as emne,
        AVG(lm.score) FILTER (WHERE lm.score IS NOT NULL) as score,
        JSONB_AGG(
          DISTINCT lm.tags
        ) FILTER (WHERE lm.tags IS NOT NULL) as tags,
        JSONB_AGG(
          json_build_object(
            'text', lm.text,
            'isUser', lm.is_user,
            'isSystem', lm.is_system,
            'timestamp', lm.timestamp,
            'agentName', lm.agent_name,
            'image', lm.image_data
          ) ORDER BY lm.timestamp ASC
        ) as conversation_data,
        FALSE as viewed,
        0 as purchase_amount,
        FALSE as has_unread_comments
      FROM livechat_messages lm
      WHERE lm.chatbot_id = ANY($1)
    `;
    
    let queryParams = [chatbotIds];
    let paramIndex = 2;

    if (conversation_filter && conversation_filter.trim() !== '') {
      queryText += ` AND lm.text ILIKE '%' || $${paramIndex++} || '%'`;
      queryParams.push(conversation_filter);
    }

    if (emne && emne !== '') {
      queryText += ` AND lm.emne = $${paramIndex++}`;
      queryParams.push(emne);
    }

    if (tags && tags !== '') {
      queryText += ` AND lm.tags::text ILIKE '%' || $${paramIndex++} || '%'`;
      queryParams.push(tags);
    }

    queryText += ` 
      GROUP BY lm.user_id, lm.chatbot_id
      ORDER BY MAX(lm.timestamp) DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    queryParams.push(page_size, offset);

    const result = await pool.query(queryText, queryParams);
    
    // Format the response to match the expected format
    const formattedResults = result.rows.map(row => ({
      ...row,
      id: `${row.user_id}_${row.chatbot_id}`, // Create a unique ID for the conversation
      tags: row.tags && row.tags[0] ? row.tags[0] : null,
      score: row.score ? Math.round(row.score) : null
    }));

    res.json(formattedResults);
  } catch (err) {
    console.error('Error fetching livechat conversations metadata:', err);
    res.status(500).json({
      error: 'Database error',
      details: err.message
    });
  }
});

// GET endpoint for livechat conversation count (replaces conversation-count for livechat)
app.get('/livechat-conversation-count', authenticateToken, async (req, res) => {
  const { chatbot_id, conversation_filter, emne, tags } = req.query;

  if (!chatbot_id) {
    return res.status(400).json({ error: 'chatbot_id is required' });
  }

  try {
    const chatbotIds = chatbot_id.split(',');
    
    let queryText = `
      SELECT COUNT(DISTINCT (lm.user_id, lm.chatbot_id)) as conversation_count
      FROM livechat_messages lm
      WHERE lm.chatbot_id = ANY($1)
    `;
    
    let queryParams = [chatbotIds];
    let paramIndex = 2;

    if (conversation_filter && conversation_filter.trim() !== '') {
      queryText += ` AND lm.text ILIKE '%' || $${paramIndex++} || '%'`;
      queryParams.push(conversation_filter);
    }

    if (emne && emne !== '') {
      queryText += ` AND lm.emne = $${paramIndex++}`;
      queryParams.push(emne);
    }

    if (tags && tags !== '') {
      queryText += ` AND lm.tags::text ILIKE '%' || $${paramIndex++} || '%'`;
      queryParams.push(tags);
    }

    const result = await pool.query(queryText, queryParams);
    res.json([{ conversation_count: parseInt(result.rows[0].conversation_count) }]);
  } catch (err) {
    console.error('Error fetching livechat conversation count:', err);
    res.status(500).json({
      error: 'Database error',
      details: err.message
    });
  }
});

// GET single livechat conversation (replaces /conversation/:id for livechat)
app.get('/livechat-conversation/:userId/:chatbotId', authenticateToken, async (req, res) => {
  const { userId, chatbotId } = req.params;

  try {
    const result = await pool.query(`
      SELECT 
        $1 || '_' || $2 as id,
        $1 as user_id,
        $2 as chatbot_id,
        COUNT(*) as message_count,
        MAX(lm.timestamp) as created_at,
        STRING_AGG(DISTINCT lm.emne, ', ') FILTER (WHERE lm.emne IS NOT NULL) as emne,
        AVG(lm.score) FILTER (WHERE lm.score IS NOT NULL) as score,
        JSONB_AGG(
          json_build_object(
            'text', lm.text,
            'isUser', lm.is_user,
            'isSystem', lm.is_system,
            'timestamp', lm.timestamp,
            'agentName', lm.agent_name,
            'profilePicture', lm.agent_profile_picture,
            'image', lm.image_data
          ) ORDER BY lm.timestamp ASC
        ) as conversation_data,
        0 as purchase_amount
      FROM livechat_messages lm
      WHERE lm.user_id = $1 AND lm.chatbot_id = $2
      GROUP BY lm.user_id, lm.chatbot_id
    `, [userId, chatbotId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Livechat conversation not found' });
    }

    const conversation = result.rows[0];
    conversation.score = conversation.score ? Math.round(conversation.score) : null;

    res.json(conversation);
  } catch (err) {
    console.error('Error retrieving livechat conversation:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});