import { analyzeMissingInfoController } from '../controllers/conversationMissingInfoController.js';

/**
 * Register routes for conversation missing information analysis
 * @param {Object} app - Express app
 * @param {Object} pool - Database connection pool
 * @param {Function} authenticateToken - Authentication middleware
 */
export function registerConversationMissingInfoRoutes(app, pool, authenticateToken) {
  // GET endpoint to extract the actual unanswered question from a conversation
  app.get(
    '/api/conversations/:conversationId/missing-info-analysis',
    authenticateToken,
    (req, res) => analyzeMissingInfoController(req, res, pool)
  );

  console.log('✅ Conversation missing info analysis routes registered');
}
