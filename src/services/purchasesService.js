import { validatePurchasePayload } from '../utils/purchasesUtils.js';

export async function createPurchaseService(body, pool) {
  const validationError = validatePurchasePayload(body);
  if (validationError) {
    return { statusCode: 400, payload: { error: validationError } };
  }

  const { user_id, chatbot_id, amount, currency = 'DKK' } = body;
  const result = await pool.query(
    `INSERT INTO purchases (user_id, chatbot_id, amount, currency)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [user_id, chatbot_id, parseFloat(amount), currency]
  );
  return { statusCode: 201, payload: { message: 'Purchase recorded', purchase: result.rows[0] } };
}

export async function listPurchasesService(params, query, pool) {
  const { chatbot_id } = params;
  const { user_id, start_date, end_date } = query || {};
  if (!chatbot_id) {
    return { statusCode: 400, payload: { error: 'chatbot_id is required' } };
  }

  let queryText = `SELECT * FROM purchases WHERE chatbot_id = $1`;
  const queryParams = [chatbot_id];
  let idx = 2;
  if (user_id) { queryText += ` AND user_id = $${idx++}`; queryParams.push(user_id); }
  if (start_date && end_date) { queryText += ` AND created_at BETWEEN $${idx++} AND $${idx++}`; queryParams.push(start_date, end_date); }
  queryText += ' ORDER BY created_at DESC';

  const result = await pool.query(queryText, queryParams);
  return { statusCode: 200, payload: result.rows };
}

export async function hasPurchaseConversationsService(query, pool) {
  const { chatbot_id } = query || {};
  if (!chatbot_id) {
    return { statusCode: 400, payload: { error: 'chatbot_id is required' } };
  }
  const chatbotIds = chatbot_id.split(',');
  const result = await pool.query(
    `SELECT EXISTS(
      SELECT 1 FROM conversations c
      JOIN purchases p ON c.user_id = p.user_id AND c.chatbot_id = p.chatbot_id
      WHERE c.chatbot_id = ANY($1) AND p.amount > 0
    ) as has_purchase_conversations`,
    [chatbotIds]
  );
  return { statusCode: 200, payload: { has_purchase_conversations: result.rows[0].has_purchase_conversations } };
}
