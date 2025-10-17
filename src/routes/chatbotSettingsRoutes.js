import express from 'express';
import {
  getChatbotSettingsController,
  updateChatbotSettingsController,
  getAllChatbotIdsController
} from '../controllers/chatbotSettingsController.js';

/**
 * Chatbot Settings Routes
 * API endpoints for Dashboard to manage chatbot configuration
 * All endpoints require authentication
 */
export function registerChatbotSettingsRoutes(app, pool, authenticateToken) {
  const router = express.Router();

  /**
   * GET /api/chatbot-settings
   * Get list of all chatbot IDs
   */
  router.get('/chatbot-settings', authenticateToken, (req, res) => {
    getAllChatbotIdsController(req, res, pool);
  });

  /**
   * GET /api/chatbot-settings/:chatbot_id
   * Get complete settings for a specific chatbot
   */
  router.get('/chatbot-settings/:chatbot_id', authenticateToken, (req, res) => {
    getChatbotSettingsController(req, res, pool);
  });

  /**
   * PUT /api/chatbot-settings/:chatbot_id
   * Update settings for a specific chatbot
   */
  router.put('/chatbot-settings/:chatbot_id', authenticateToken, (req, res) => {
    updateChatbotSettingsController(req, res, pool);
  });

  app.use('/api', router);
  
  console.log('✅ Chatbot settings routes registered');
}

