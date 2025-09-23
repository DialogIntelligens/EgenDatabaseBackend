import { createPurchaseService, listPurchasesService, hasPurchaseConversationsService } from '../services/purchasesService.js';

export async function createPurchaseController(req, res, pool) {
  try {
    const { statusCode, payload } = await createPurchaseService(req.body, pool);
    return res.status(statusCode).json(payload);
  } catch (err) {
    console.error('Error recording purchase:', err);
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}

export async function listPurchasesController(req, res, pool) {
  try {
    const { statusCode, payload } = await listPurchasesService(req.params, req.query, pool);
    return res.status(statusCode).json(payload);
  } catch (err) {
    console.error('Error fetching purchases:', err);
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}

export async function hasPurchaseConversationsController(req, res, pool) {
  try {
    const { statusCode, payload } = await hasPurchaseConversationsService(req.query, pool);
    return res.status(statusCode).json(payload);
  } catch (err) {
    console.error('Error checking purchase conversations:', err);
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}
