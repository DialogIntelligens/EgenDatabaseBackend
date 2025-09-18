import { validCategories, categorizeError } from '../utils/errorsUtils.js';

export async function logErrorService(body, pool) {
  const {
    chatbot_id,
    user_id,
    error_message,
    error_details,
    stack_trace,
    error_category: providedCategory
  } = body || {};

  if (!chatbot_id || !error_message) {
    return { statusCode: 400, payload: { error: 'chatbot_id and error_message are required' } };
  }

  const error_category = validCategories.includes(providedCategory)
    ? providedCategory
    : categorizeError(error_message, error_details);

  const result = await pool.query(
    `INSERT INTO error_logs (chatbot_id, user_id, error_category, error_message, error_details, stack_trace)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      chatbot_id,
      user_id || null,
      error_category,
      error_message,
      error_details ? JSON.stringify(error_details) : null,
      stack_trace || null
    ]
  );

  return {
    statusCode: 201,
    payload: {
      message: 'Error logged successfully',
      error_log: result.rows[0]
    }
  };
}
