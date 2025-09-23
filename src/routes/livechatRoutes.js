import express from 'express';
import {
  appendLivechatMessageController,
  getConversationMessagesController,
  migrateConversationWithMessagesController,
  getLivechatConversationAtomicController,
  setAgentTypingStatusController,
  getAgentTypingStatusController,
  getLivechatStatisticsController,
  getPublicAverageResponseTimeController
} from '../controllers/livechatController.js';

export function registerLivechatRoutes(app, pool, authenticateToken) {
  const router = express.Router();

  // Atomic message endpoints
  router.post('/append-livechat-message', async (req, res) => {
    await appendLivechatMessageController(req, res, pool);
  });

  router.get('/conversation-messages', async (req, res) => {
    await getConversationMessagesController(req, res, pool);
  });

  router.post('/migrate-conversation-to-atomic-with-messages', async (req, res) => {
    await migrateConversationWithMessagesController(req, res, pool);
  });

  router.get('/livechat-conversation-atomic', async (req, res) => {
    await getLivechatConversationAtomicController(req, res, pool);
  });

  // Typing status
  router.post('/agent-typing-status', async (req, res) => {
    await setAgentTypingStatusController(req, res, pool);
  });

  router.get('/agent-typing-status', async (req, res) => {
    await getAgentTypingStatusController(req, res, pool);
  });

  // Stats
  router.get('/livechat-statistics', authenticateToken, async (req, res) => {
    await getLivechatStatisticsController(req, res, pool, req.user);
  });

  router.get('/public/average-response-time/:chatbot_id', async (req, res) => {
    await getPublicAverageResponseTimeController(req, res, pool);
  });

  app.use('/', router);
}


