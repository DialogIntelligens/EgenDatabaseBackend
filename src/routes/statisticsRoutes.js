import express from 'express';
import { 
  getConsolidatedStatisticsController,
  getTagStatisticsController,
  analyzeConversationsController,
  getGreetingRateController
} from '../controllers/statisticsController.js';

export function registerStatisticsRoutes(app, pool, authenticateToken) {
  const router = express.Router();

  router.get('/statistics-consolidated', authenticateToken, (req, res) => getConsolidatedStatisticsController(req, res, pool));
  router.get('/tag-statistics', authenticateToken, (req, res) => getTagStatisticsController(req, res, pool));
  router.post('/analyze-conversations', authenticateToken, (req, res) => analyzeConversationsController(req, res, pool));
  router.get('/greeting-rate', authenticateToken, (req, res) => getGreetingRateController(req, res, pool));

  app.use('/', router);
}


