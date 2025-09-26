import { createFreshdeskTicket } from '../utils/freshdeskUtils.js';
import { createFreshdeskQueueService } from './freshdeskQueueService.js';

/**
 * Legacy function for direct ticket creation (kept for backwards compatibility)
 * @deprecated Use queueTicketService instead for better reliability
 */
export async function createTicketService(body, pool) {
  const { email, subject, description } = body || {};
  if (!email || !subject || !description) {
    return { statusCode: 400, payload: { error: 'Missing required fields: email, subject, and description are required' } };
  }

  // Skip Freshdesk processing in development environment
  if (process.env.NODE_ENV === 'development') {
    console.log(`Development mode: Skipping direct Freshdesk ticket creation for email=${email}, subject="${subject}"`);
    return {
      statusCode: 200,
      payload: {
        message: 'Development mode: Direct ticket processing skipped',
        email: email,
        subject: subject,
        environment: 'development',
        note: 'This ticket would be processed in production'
      }
    };
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

/**
 * New async service that queues tickets for background processing
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

  // Skip Freshdesk processing in development environment
  if (process.env.NODE_ENV === 'development') {
    console.log(`Development mode: Skipping Freshdesk ticket creation for email=${email}, subject="${subject}"`);
    return {
      statusCode: 200,
      payload: {
        message: 'Development mode: Ticket processing skipped',
        email: email,
        subject: subject,
        environment: 'development',
        note: 'This ticket would be processed in production'
      }
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
    try {
      const error_details = {
        requestMeta: { email, subject },
        queueError: true,
        chatbotId,
        userId
      };
      const error_category = 'FRESHDESK_QUEUE_ERROR';
      await pool.query(
        `INSERT INTO error_logs (chatbot_id, user_id, error_category, error_message, error_details, stack_trace)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [chatbotId, userId, error_category, error.message || 'Freshdesk queue failure', JSON.stringify(error_details), error.stack || null]
      );
    } catch (logErr) {
      console.error('Backend: Failed to log Freshdesk queue error to DB:', logErr);
    }

    // Fallback to direct processing if queue fails
    console.warn('Queue failed, falling back to direct processing:', error.message);
    return await createTicketService(body, pool);
  }
}


