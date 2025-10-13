import express from 'express';
import {
  processMessageController,
  getStreamingEventsController,
  uploadImageController,
  conversationHealthController
} from '../controllers/conversationProcessingController.js';

/**
 * Register conversation processing routes
 * These are the new endpoints that will replace frontend conversation logic
 */
export function registerConversationProcessingRoutes(app, pool, authenticateToken) {
  const router = express.Router();

  // Main conversation processing endpoint
  // Replaces the complex frontend sendMessage logic
  router.post('/process-message', async (req, res) => {
    await processMessageController(req, res, pool);
  });

  // Streaming events polling endpoint
  // Frontend will poll this to get streaming updates
  router.get('/stream-events/:streamingSessionId', async (req, res) => {
    await getStreamingEventsController(req, res, pool);
  });

  // 🔒 REMOVED: /conversation-config/:chatbotId endpoint
  // This endpoint was exposing ALL credentials including API keys to unauthenticated users!
  // Backend services should use ConfigurationService.getFrontendConfiguration() directly
  // If you need this endpoint for testing, add authenticateToken middleware

  // Image upload and processing endpoint
  // Handles image uploads separately from main message processing
  router.post('/upload-image', async (req, res) => {
    await uploadImageController(req, res, pool);
  });

  // Health check endpoint
  // Monitor the health of conversation processing services
  router.get('/conversation-health', async (req, res) => {
    await conversationHealthController(req, res, pool);
  });

  // Mount the router under /api
  app.use('/api', router);

  console.log('✅ Conversation processing routes registered');
}
