import { createTicketService } from '../services/freshdeskService.js';

export async function createTicketController(req, res, pool) {
  console.log('Backend: Received Freshdesk ticket creation request');
  const { statusCode, payload } = await createTicketService(req.body, pool);
  return res.status(statusCode).json(payload);
}


