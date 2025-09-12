import express from 'express';
import { generateReportController } from '../controllers/mainController.js';

/**
 * Register main routes for the application
 * @param {Object} app - Express app instance
 * @param {Object} pool - Database connection pool
 * @param {Function} authenticateToken - Authentication middleware
 */
export function registerMainRoutes(app, pool, authenticateToken) {
  const router = express.Router();

  // POST /generate-report - Generate PDF report
  router.post('/generate-report', authenticateToken, async (req, res) => {
    // Attach pool to req for service layer access
    req.pool = pool;
    await generateReportController(req, res);
  });

  // Mount the router
  app.use('/', router);
}
