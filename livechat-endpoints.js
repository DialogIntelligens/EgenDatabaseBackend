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

// GET endpoint for dashboard to fetch livechat conversations
app.get('/livechat-conversations-list', authenticateToken, async (req, res) => {
  const { chatbot_id, page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  try {
    // Get unique conversations with their latest message
    const result = await pool.query(`
      SELECT 
        lm.user_id,
        lm.chatbot_id,
        COUNT(*) as message_count,
        MAX(lm.timestamp) as last_message_time,
        ARRAY_AGG(
          json_build_object(
            'text', lm.text,
            'is_user', lm.is_user,
            'is_system', lm.is_system,
            'timestamp', lm.timestamp,
            'agent_name', lm.agent_name,
            'emne', lm.emne,
            'score', lm.score
          ) ORDER BY lm.timestamp ASC
        ) as messages
      FROM livechat_messages lm
      WHERE ($1::text IS NULL OR lm.chatbot_id = $1)
      GROUP BY lm.user_id, lm.chatbot_id
      ORDER BY MAX(lm.timestamp) DESC
      LIMIT $2 OFFSET $3`,
      [chatbot_id === 'ALL' ? null : chatbot_id, limit, offset]
    );

    res.json({ conversations: result.rows });
  } catch (err) {
    console.error('Error fetching livechat conversations:', err);
    res.status(500).json({
      error: 'Database error',
      details: err.message
    });
  }
});