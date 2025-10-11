import { queueTicketService } from '../services/freshdeskService.js';

export async function createTicketController(req, res, pool) {
  console.log('Backend: Received Freshdesk ticket creation request');

  // Extract chatbot_id and user_id from request for better tracking
  const chatbotId = req.body.chatbot_id || req.headers['x-chatbot-id'] || null;
  const userId = req.body.user_id || req.headers['x-user-id'] || null;

  // Use queue service for async processing
  const { statusCode, payload } = await queueTicketService(req.body, pool, chatbotId, userId);
  return res.status(statusCode).json(payload);
}