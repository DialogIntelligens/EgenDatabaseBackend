import { createFreshdeskTicket } from '../utils/freshdeskUtils.js';

export async function createTicketService(body, pool) {
  const { email, subject, description } = body || {};
  if (!email || !subject || !description) {
    return { statusCode: 400, payload: { error: 'Missing required fields: email, subject, and description are required' } };
  }

  try {
    const result = await createFreshdeskTicket(body);
    return {
      statusCode: 201,
      payload: {
        ticket_id: result.id,
        message: 'Freshdesk ticket created successfully',
        freshdesk_response: result
      }
    };
  } catch (error) {
    try {
      const error_details = {
        ...(error.context || {}),
        requestMeta: { email, subject }
      };
      const error_category = 'FRESHDESK_ERROR';
      await pool.query(
        `INSERT INTO error_logs (chatbot_id, user_id, error_category, error_message, error_details, stack_trace)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [null, null, error_category, error.message || 'Freshdesk ticket failure', JSON.stringify(error_details), error.stack || null]
      );
    } catch (logErr) {
      console.error('Backend: Failed to log Freshdesk error to DB:', logErr);
    }
    return {
      statusCode: 500,
      payload: {
        error: 'Failed to create Freshdesk ticket',
        message: error.message,
        details: error.stack
      }
    };
  }
}


