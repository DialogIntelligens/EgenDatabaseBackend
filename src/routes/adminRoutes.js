import {
  deleteUserController,
  getUsersController,
  getUserByIdController,
  updateUserController,
  resetPasswordController,
  archiveUserController,
  getArchivedUsersController,
  updateCompanyInfoController,
  getConversationUpdateJobsController,
  cancelConversationUpdateJobController,
  getErrorLogsController,
  getErrorStatisticsController,
  getRevenueAnalyticsController,
  getMonthlyConversationBreakdownController,
  getUserTrackingStatsController,
  updateUserPineconeApiKeyController,
  updateUserIndexesController
} from '../controllers/adminController.js';

export function registerAdminRoutes(app, pool, authenticateToken, getPineconeApiKeyForIndex) {
  // User Management
  app.delete('/users/:id', authenticateToken, (req, res) => deleteUserController(req, res, pool, getPineconeApiKeyForIndex));
  app.get('/users', authenticateToken, (req, res) => getUsersController(req, res, pool));
  app.get('/user/:id', authenticateToken, (req, res) => getUserByIdController(req, res, pool));
  app.patch('/users/:id', authenticateToken, (req, res) => updateUserController(req, res, pool));
  app.post('/reset-password/:id', authenticateToken, (req, res) => resetPasswordController(req, res, pool));
  app.patch('/users/:id/archive', authenticateToken, (req, res) => archiveUserController(req, res, pool));
  app.get('/users/archived', authenticateToken, (req, res) => getArchivedUsersController(req, res, pool));
  app.put('/admin/update-company-info/:userId', authenticateToken, (req, res) => updateCompanyInfoController(req, res, pool));

  // Job Management
  app.get('/conversation-update-jobs', authenticateToken, (req, res) => getConversationUpdateJobsController(req, res, pool));
  app.post('/cancel-conversation-update-job/:jobId', authenticateToken, (req, res) => cancelConversationUpdateJobController(req, res, pool));

  // Error Monitoring
  app.get('/api/error-logs', authenticateToken, (req, res) => getErrorLogsController(req, res, pool));
  app.get('/api/error-statistics', authenticateToken, (req, res) => getErrorStatisticsController(req, res, pool));

  // Admin Extensions
  app.get('/revenue-analytics', authenticateToken, (req, res) => getRevenueAnalyticsController(req, res, pool));
  app.get('/monthly-conversation-breakdown', authenticateToken, (req, res) => getMonthlyConversationBreakdownController(req, res, pool));
  app.get('/user-tracking-stats', authenticateToken, (req, res) => getUserTrackingStatsController(req, res, pool));
  app.put('/user-pinecone-api-key/:id', authenticateToken, (req, res) => updateUserPineconeApiKeyController(req, res, pool));
  app.put('/user-indexes/:id', authenticateToken, (req, res) => updateUserIndexesController(req, res, pool));
}


