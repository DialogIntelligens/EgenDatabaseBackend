import { getShopifyOrdersService, getShopifyOrderByIdService } from '../services/shopifyService.js';

export async function getShopifyOrdersController(req, res, pool) {
  try {
    const data = await getShopifyOrdersService(req.body, pool);
    res.json(data);
  } catch (error) {
    console.error('Shopify orders controller error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}

export async function getShopifyOrderByIdController(req, res) {
  try {
    const data = await getShopifyOrderByIdService(req.params, req.query);
    res.json(data);
  } catch (error) {
    console.error('Shopify order details controller error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}


