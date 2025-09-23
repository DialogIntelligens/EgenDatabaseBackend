import express from 'express';
import { generateReportController } from '../controllers/reportController.js';

/**
 * Register report routes for the application
 * @param {Object} app - Express app instance
 * @param {Object} pool - Database pool connection
 * @param {Function} authenticateToken - Authentication middleware
 */
export function registerReportRoutes(app, pool, authenticateToken) {
  const router = express.Router();

  // POST /generate-report - Generate PDF report
  router.post('/generate-report', authenticateToken, async (req, res) => {
    await generateReportController(req, res, pool);
  });

  // Mount the router
  app.use('/', router);
}
