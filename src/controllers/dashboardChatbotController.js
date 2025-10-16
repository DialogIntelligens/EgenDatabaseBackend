import { DashboardChatbotService } from '../services/dashboardChatbotService.js';

/**
 * Dashboard Chatbot Controllers
 * Handles dashboard requests for chatbot settings management
 */

export async function getChatbotSettingsController(req, res, pool) {
  try {
    const { chatbot_id } = req.params;
    
    if (!chatbot_id) {
      return res.status(400).json({ error: 'chatbot_id is required' });
    }

    const service = new DashboardChatbotService(pool);
    const { statusCode, payload } = await service.getChatbotSettings(chatbot_id);
    
    return res.status(statusCode).json(payload);
  } catch (error) {
    console.error('Error in getChatbotSettingsController:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateChatbotSettingsController(req, res, pool) {
  try {
    const { chatbot_id } = req.params;
    const settings = req.body;
    
    if (!chatbot_id) {
      return res.status(400).json({ error: 'chatbot_id is required' });
    }

    if (!settings || Object.keys(settings).length === 0) {
      return res.status(400).json({ error: 'Settings object is required' });
    }

    const service = new DashboardChatbotService(pool);
    const { statusCode, payload } = await service.updateChatbotSettings(chatbot_id, settings);
    
    return res.status(statusCode).json(payload);
  } catch (error) {
    console.error('Error in updateChatbotSettingsController:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getUserChatbotsController(req, res, pool) {
  try {
    const userId = req.user?.userId; // authenticateToken sets req.user.userId
    
    if (!userId) {
      console.error('getUserChatbotsController: No userId found in req.user:', req.user);
      return res.status(401).json({ error: 'User not authenticated' });
    }

    console.log('📋 Loading chatbots for user:', userId);
    const service = new DashboardChatbotService(pool);
    const { statusCode, payload } = await service.getUserChatbots(userId);
    
    return res.status(statusCode).json(payload);
  } catch (error) {
    console.error('Error in getUserChatbotsController:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

