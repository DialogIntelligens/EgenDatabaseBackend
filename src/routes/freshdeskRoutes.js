import { createTicketController } from '../controllers/freshdeskController.js';
import { createFreshdeskQueueService } from '../services/freshdeskQueueService.js';

export function registerFreshdeskRoutes(app, pool) {
  // Main endpoint - async queue processing
  app.post('/api/create-freshdesk-ticket', (req, res) => createTicketController(req, res, pool));
  
  // Queue management endpoints
  app.get('/api/freshdesk-queue/stats', async (req, res) => {
    try {
      const queueService = createFreshdeskQueueService(pool);
      const stats = await queueService.getQueueStats();
      res.json({ success: true, stats });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get queue stats', message: error.message });
    }
  });
  
  // Manual processing trigger (for admin)
  app.post('/api/freshdesk-queue/process', async (req, res) => {
    try {
      const queueService = createFreshdeskQueueService(pool);
      const batchSize = parseInt(req.query.batch_size) || 5;
      const result = await queueService.processPendingTickets(batchSize);
      res.json({ success: true, result });
    } catch (error) {
      res.status(500).json({ error: 'Failed to process queue', message: error.message });
    }
  });
}


