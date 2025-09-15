import express from 'express';
import {
  getGdprSettingsController,
  saveGdprSettingsController,
  previewGdprCleanupController,
  executeGdprCleanupController,
  runGdprCleanupAllController
} from '../controllers/gdprController.js';

export function registerGdprRoutes(app, pool, authenticateToken) {
  const router = express.Router();

  // GET /gdpr-settings/:chatbot_id
  router.get('/gdpr-settings/:chatbot_id', authenticateToken, async (req, res) => {
    await getGdprSettingsController(req, res, pool);
  });

  // POST /gdpr-settings
  router.post('/gdpr-settings', authenticateToken, async (req, res) => {
    await saveGdprSettingsController(req, res, pool);
  });

  // GET /gdpr-preview/:chatbot_id?retention_days=NNN
  router.get('/gdpr-preview/:chatbot_id', authenticateToken, async (req, res) => {
    await previewGdprCleanupController(req, res, pool);
  });

  // POST /gdpr-cleanup/:chatbot_id { retention_days }
  router.post('/gdpr-cleanup/:chatbot_id', authenticateToken, async (req, res) => {
    await executeGdprCleanupController(req, res, pool);
  });

  // POST /gdpr-cleanup-all
  router.post('/gdpr-cleanup-all', authenticateToken, async (req, res) => {
    await runGdprCleanupAllController(req, res, pool);
  });

  app.use('/', router);
}


