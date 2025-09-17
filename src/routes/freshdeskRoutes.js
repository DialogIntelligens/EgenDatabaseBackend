import { createTicketController } from '../controllers/freshdeskController.js';

export function registerFreshdeskRoutes(app, pool) {
  app.post('/api/create-freshdesk-ticket', (req, res) => createTicketController(req, res, pool));
}


