import { createTicketService, queueTicketService } from '../services/freshdeskService.js';

export async function createTicketController(req, res, pool) {
  const isDevelopment = process.env.NODE_ENV === 'development';
  console.log(`Backend: Received Freshdesk ticket creation request${isDevelopment ? ' (DEVELOPMENT MODE)' : ''}`);
  
  // Extract chatbot_id and user_id from request for better tracking
  const chatbotId = req.body.chatbot_id || req.headers['x-chatbot-id'] || null;
  const userId = req.body.user_id || req.headers['x-user-id'] || null;
  
  // Use queue service for async processing (default behavior)
  const useQueue = req.query.async !== 'false'; // Allow opt-out with ?async=false
  
  if (useQueue) {
    console.log(`Backend: Processing Freshdesk ticket via queue${isDevelopment ? ' (will be skipped in development)' : ''}`);
    const { statusCode, payload } = await queueTicketService(req.body, pool, chatbotId, userId);
    return res.status(statusCode).json(payload);
  } else {
    console.log(`Backend: Processing Freshdesk ticket directly (legacy mode)${isDevelopment ? ' (will be skipped in development)' : ''}`);
    const { statusCode, payload } = await createTicketService(req.body, pool);
    return res.status(statusCode).json(payload);
  }
}

/**
 * New endpoint for direct ticket creation (for admin/testing purposes)
 */
export async function createTicketDirectController(req, res, pool) {
  const isDevelopment = process.env.NODE_ENV === 'development';
  console.log(`Backend: Received direct Freshdesk ticket creation request${isDevelopment ? ' (DEVELOPMENT MODE - will be skipped)' : ''}`);
  const { statusCode, payload } = await createTicketService(req.body, pool);
  return res.status(statusCode).json(payload);
}


