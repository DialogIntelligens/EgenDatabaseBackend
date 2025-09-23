import { searchMagentoOrdersController, getMagentoOrderByIdController } from '../controllers/magentoController.js';

/**
 * Register Magento routes
 * @param {Object} app - Express app instance
 * @param {Object} pool - Database pool connection
 */
export function registerMagentoRoutes(app, pool) {
  // POST /api/magento/orders - Search for orders (no auth required)
  app.post('/api/magento/orders', (req, res) => searchMagentoOrdersController(req, res, pool));

  // GET /api/magento/orders/:order_id - Get specific order by ID (no auth required)
  app.get('/api/magento/orders/:order_id', (req, res) => getMagentoOrderByIdController(req, res));
}
