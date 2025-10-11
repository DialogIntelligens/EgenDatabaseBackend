import { createFreshdeskQueueService } from './freshdeskQueueService.js';

/**
 * Async service that queues tickets for background processing
 * This prevents timeout issues and provides better user experience
 */
export async function queueTicketService(body, pool, chatbotId = null, userId = null) {
  const { email, subject, description } = body || {};
  if (!email || !subject || !description) {
    return {
      statusCode: 400,
      payload: { error: 'Missing required fields: email, subject, and description are required' }
    };
  }

  try {
    // Create queue service instance
    const queueService = createFreshdeskQueueService(pool);

    // Add ticket to processing queue
    const queueResult = await queueService.queueTicket(body, chatbotId, userId);

    // Log successful queuing
    console.log(`Freshdesk ticket queued: email=${email}, queue_id=${queueResult.queue_id}`);

    return {
      statusCode: 202, // 202 Accepted - indicates async processing
      payload: {
        message: 'Your message has been received and will be processed shortly',
        queue_id: queueResult.queue_id,
        queued_at: queueResult.queued_at,
        status: 'queued'
      }
    };
  } catch (error) {
    // Log the queuing error
    const error_details = {
      requestMeta: { email, subject },
      queueError: true,
      chatbotId,
      userId
    };
    const error_category = 'FRESHDESK_QUEUE_ERROR';

    try {
      await pool.query(
        `INSERT INTO error_logs (chatbot_id, user_id, error_category, error_message, error_details, stack_trace)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [chatbotId, userId, error_category, error.message || 'Freshdesk queue failure', JSON.stringify(error_details), error.stack || null]
      );
    } catch (logErr) {
      console.error('Backend: Failed to log Freshdesk queue error to DB:', logErr);
    }

    return {
      statusCode: 500,
      payload: {
        error: 'Failed to queue Freshdesk ticket',
        message: error.message,
        details: error.stack
      }
    };
  }
}


