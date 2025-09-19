import express from 'express';
import {
  getShopifyOrdersController,
  getShopifyOrderByIdController,
  getShopifyCredentialsController,
  upsertShopifyCredentialsController,
  deleteShopifyCredentialsController
} from '../controllers/shopifyController.js';

export function registerShopifyRoutes(app, pool) {
  const router = express.Router();

  // Existing order endpoints
  router.post('/api/shopify/orders', async (req, res) => {
    await getShopifyOrdersController(req, res, pool);
  });

  router.get('/api/shopify/orders/:order_id', async (req, res) => {
    await getShopifyOrderByIdController(req, res);
  });

  // New credentials endpoints (keep both path variants)
  router.get('/api/shopify/credentials/:chatbot_id', async (req, res) => {
    await getShopifyCredentialsController(req, res, pool);
  });

  router.post('/api/shopify/credentials', async (req, res) => {
    await upsertShopifyCredentialsController(req, res, pool);
  });

  router.delete('/api/shopify/credentials/:chatbot_id', async (req, res) => {
    await deleteShopifyCredentialsController(req, res, pool);
  });

  // Alternative credentials paths for backward compatibility
  router.get('/api/shopify-credentials/:chatbotId', async (req, res) => {
    req.params.chatbot_id = req.params.chatbotId;
    await getShopifyCredentialsController(req, res, pool);
  });

  router.post('/api/shopify-credentials', async (req, res) => {
    await upsertShopifyCredentialsController(req, res, pool);
  });

  router.delete('/api/shopify-credentials/:chatbotId', async (req, res) => {
    req.params.chatbot_id = req.params.chatbotId;
    await deleteShopifyCredentialsController(req, res, pool);
  });

  router.get('/api/shopify-credentials', async (req, res) => {
    // List all credentials (admin function)
    try {
      const result = await pool.query(`
        SELECT id, chatbot_id, shopify_store, shopify_enabled, created_at, updated_at
        FROM shopify_credentials
        ORDER BY created_at DESC
      `);
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching all Shopify credentials:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Public settings endpoint
  router.get('/api/shopify-settings/:chatbotId', async (req, res) => {
    try {
      const { chatbotId } = req.params;
      const query = `
        SELECT shopify_enabled, shopify_store
        FROM shopify_credentials
        WHERE chatbot_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `;

      const result = await pool.query(query, [chatbotId]);

      if (result.rows.length === 0) {
        return res.json({
          shopifyEnabled: false,
          shopifyStore: '',
          shopifyApiVersion: '2024-10',
          orderTrackingUseProxy: true,
          orderTrackingProxyUrl: 'https://egendatabasebackend.onrender.com/api/shopify/orders',
          orderTrackingRequestMethod: 'POST',
          trackingRequiredFields: ['email', 'phone', 'order_number']
        });
      }

      const row = result.rows[0];
      res.json({
        shopifyEnabled: row.shopify_enabled === true,
        shopifyStore: row.shopify_store || '',
        shopifyApiVersion: '2024-10',
        orderTrackingUseProxy: true,
        orderTrackingProxyUrl: 'https://egendatabasebackend.onrender.com/api/shopify/orders',
        orderTrackingRequestMethod: 'POST',
        trackingRequiredFields: ['email', 'phone', 'order_number']
      });
    } catch (error) {
      console.error('Error fetching Shopify settings:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.use('/', router);
}


