import express from 'express';
import {
  getChatbotSettingsController,
  updateChatbotSettingsController,
  getUserChatbotsController
} from '../controllers/dashboardChatbotController.js';

/**
 * Dashboard Chatbot Routes
 * API endpoints for managing chatbot settings from the dashboard
 * All endpoints require authentication
 */
export function registerDashboardChatbotRoutes(app, pool, authenticateToken) {
  const router = express.Router();

  // GET list of chatbots accessible to the authenticated user
  router.get('/user-chatbots', authenticateToken, (req, res) => {
    getUserChatbotsController(req, res, pool);
  });

  // GET chatbot settings for editing in dashboard
  router.get('/chatbot-settings/:chatbot_id', authenticateToken, (req, res) => {
    getChatbotSettingsController(req, res, pool);
  });

  // PUT (update) chatbot settings from dashboard
  router.put('/chatbot-settings/:chatbot_id', authenticateToken, (req, res) => {
    updateChatbotSettingsController(req, res, pool);
  });

  // Mount under /api/dashboard
  app.use('/api/dashboard', router);

  console.log('✅ Dashboard chatbot routes registered');
}

