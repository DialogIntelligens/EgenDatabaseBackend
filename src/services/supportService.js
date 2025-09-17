export async function getSupportStatusByChatbotService(chatbot_id, pool) {
  const result = await pool.query(
    `SELECT ss.user_id, ss.is_live, u.username 
     FROM support_status ss 
     JOIN users u ON ss.user_id = u.id 
     WHERE ss.chatbot_id = $1 AND u.livechat = true`,
    [chatbot_id]
  );
  const isAnyAgentLive = result.rows.some(r => r.is_live);
  return { support_available: isAnyAgentLive, agents: result.rows };
}

export async function updateSupportStatusService({ user_id, chatbot_id, is_live }, pool) {
  const userCheck = await pool.query('SELECT livechat FROM users WHERE id = $1', [user_id]);
  if (userCheck.rows.length === 0) {
    const err = new Error('User not found'); err.statusCode = 404; throw err;
  }
  if (!userCheck.rows[0].livechat) {
    const err = new Error('User does not have livechat access'); err.statusCode = 403; throw err;
  }

  const result = await pool.query(
    `INSERT INTO support_status (user_id, chatbot_id, is_live, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id, chatbot_id)
     DO UPDATE SET is_live = $3, updated_at = NOW()
     RETURNING *`,
    [user_id, chatbot_id, is_live]
  );
  return result.rows[0];
}

export async function getMySupportStatusService(user_id, pool) {
  const userCheck = await pool.query('SELECT livechat FROM users WHERE id = $1', [user_id]);
  if (userCheck.rows.length === 0) {
    const err = new Error('User not found'); err.statusCode = 404; throw err;
  }
  if (!userCheck.rows[0].livechat) {
    const err = new Error('User does not have livechat access'); err.statusCode = 403; throw err;
  }

  const result = await pool.query('SELECT * FROM support_status WHERE user_id = $1', [user_id]);
  return result.rows;
}


