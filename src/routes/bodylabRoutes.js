import { proxyOrderController } from '../controllers/bodylabController.js';

export function registerBodylabRoutes(app) {
  app.post('/api/proxy/order', (req, res) => proxyOrderController(req, res));
}


