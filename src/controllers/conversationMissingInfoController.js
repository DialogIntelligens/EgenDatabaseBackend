import { getMissingInfoAnalysis } from '../services/conversationMissingInfoService.js';

/**
 * Controller to extract the actual unanswered question from a conversation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Object} pool - Database connection pool
 */
export async function analyzeMissingInfoController(req, res, pool) {
  try {
    const { conversationId } = req.params;

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        error: 'Conversation ID is required'
      });
    }

    // Call the service to analyze the conversation
    const result = await getMissingInfoAnalysis(parseInt(conversationId), pool);

    return res.json(result);

  } catch (error) {
    console.error('Error in analyzeMissingInfoController:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to extract unanswered question'
    });
  }
}
