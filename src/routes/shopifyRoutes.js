import express from 'express';
import { getShopifyOrdersController, getShopifyOrderByIdController } from '../controllers/shopifyController.js';

export function registerShopifyRoutes(app, pool) {
  const router = express.Router();

  router.post('/api/shopify/orders', async (req, res) => {
    await getShopifyOrdersController(req, res, pool);
  });

  router.get('/api/shopify/orders/:order_id', async (req, res) => {
    await getShopifyOrderByIdController(req, res);
  });

  app.use('/', router);
}


