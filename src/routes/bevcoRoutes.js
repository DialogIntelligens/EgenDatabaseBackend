import express from 'express';
import { proxyBevcoOrderController } from '../controllers/bevcoController.js';

export function registerBevcoRoutes(app) {
  const router = express.Router();

  router.post('/api/proxy/bevco-order', async (req, res) => {
    await proxyBevcoOrderController(req, res);
  });

  app.use('/', router);
}