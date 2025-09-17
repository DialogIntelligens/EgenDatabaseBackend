import { getSupportStatusController, updateSupportStatusController, getMySupportStatusController } from '../controllers/supportController.js';

export function registerSupportRoutes(app, pool, authenticateToken) {
  app.get('/support-status/:chatbot_id', (req, res) => getSupportStatusController(req, res, pool));
  app.post('/support-status', authenticateToken, (req, res) => updateSupportStatusController(req, res, pool));
  app.get('/my-support-status', authenticateToken, (req, res) => getMySupportStatusController(req, res, pool));
}


