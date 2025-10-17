import { 
  getChatbotSettingsService, 
  updateChatbotSettingsService,
  getAllChatbotIdsService 
} from '../services/chatbotSettingsService.js';

/**
 * GET /api/chatbot-settings/:chatbot_id
 * Get all settings for a specific chatbot
 * Requires authentication
 */
export async function getChatbotSettingsController(req, res, pool) {
  try {
    const { chatbot_id } = req.params;
    const result = await getChatbotSettingsService(chatbot_id, pool);
    
    res.status(result.statusCode).json(result.payload);
  } catch (error) {
    console.error('Controller error in getChatbotSettings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * PUT /api/chatbot-settings/:chatbot_id
 * Update settings for a specific chatbot
 * Requires authentication
 */
export async function updateChatbotSettingsController(req, res, pool) {
  try {
    const { chatbot_id } = req.params;
    const updates = req.body;
    
    const result = await updateChatbotSettingsService(chatbot_id, updates, pool);
    
    res.status(result.statusCode).json(result.payload);
  } catch (error) {
    console.error('Controller error in updateChatbotSettings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/chatbot-settings
 * Get list of all chatbot IDs
 * Requires authentication
 */
export async function getAllChatbotIdsController(req, res, pool) {
  try {
    const result = await getAllChatbotIdsService(pool);
    
    res.status(result.statusCode).json(result.payload);
  } catch (error) {
    console.error('Controller error in getAllChatbotIds:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

