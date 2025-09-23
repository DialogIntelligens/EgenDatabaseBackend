import { logErrorController } from '../controllers/errorsController.js';

export function registerErrorsRoutes(app, pool) {
  // Keep public (no authenticateToken) as in current behavior
  app.post('/api/log-error', (req, res) => logErrorController(req, res, pool));
}
