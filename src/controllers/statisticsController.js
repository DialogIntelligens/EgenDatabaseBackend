import { 
  getConsolidatedStatisticsService,
  getTagStatisticsService,
  analyzeConversationsService,
  getGreetingRateService
} from '../services/statisticsService.js';

export async function getConsolidatedStatisticsController(req, res, pool) {
  const { statusCode, payload } = await getConsolidatedStatisticsService(req.query, pool);
  return res.status(statusCode).json(payload);
}

export async function getTagStatisticsController(req, res, pool) {
  const { statusCode, payload } = await getTagStatisticsService(req.query, pool);
  return res.status(statusCode).json(payload);
}

export async function analyzeConversationsController(req, res, pool) {
  const { statusCode, payload } = await analyzeConversationsService(req.body, pool);
  return res.status(statusCode).json(payload);
}

export async function getGreetingRateController(req, res, pool) {
  const { statusCode, payload } = await getGreetingRateService(req.query, pool);
  return res.status(statusCode).json(payload);
}


