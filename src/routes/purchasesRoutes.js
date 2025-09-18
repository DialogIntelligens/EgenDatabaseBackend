import { createPurchaseController, listPurchasesController, hasPurchaseConversationsController } from '../controllers/purchasesController.js';

export function registerPurchasesRoutes(app, pool, authenticateToken) {
  // Keep POST unauthenticated as in current behavior
  app.post('/purchases', (req, res) => createPurchaseController(req, res, pool));

  // Authenticated GETs
  app.get('/purchases/:chatbot_id', authenticateToken, (req, res) => listPurchasesController(req, res, pool));
  app.get('/has-purchase-conversations', authenticateToken, (req, res) => hasPurchaseConversationsController(req, res, pool));
}
