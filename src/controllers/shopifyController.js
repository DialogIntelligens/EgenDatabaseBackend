import {
  getShopifyOrdersService,
  getShopifyOrderByIdService,
  getShopifyCredentialsService,
  upsertShopifyCredentialsService,
  deleteShopifyCredentialsService
} from '../services/shopifyService.js';

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

export async function getShopifyCredentialsController(req, res, pool) {
  try {
    const { statusCode, payload } = await getShopifyCredentialsService(req.params, pool);
    return res.status(statusCode).json(payload);
  } catch (error) {
    console.error('Shopify credentials controller error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}

export async function upsertShopifyCredentialsController(req, res, pool) {
  const { statusCode, payload } = await upsertShopifyCredentialsService(req.body, pool);
  return res.status(statusCode).json(payload);
}

export async function deleteShopifyCredentialsController(req, res, pool) {
  try {
    const { statusCode, payload } = await deleteShopifyCredentialsService(req.params, pool);
    return res.status(statusCode).json(payload);
  } catch (error) {
    console.error('Shopify credentials delete controller error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}


