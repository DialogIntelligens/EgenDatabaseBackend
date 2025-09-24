import { createConversationProcessingService } from '../services/conversationProcessingService.js';
import { createAiStreamingService } from '../services/aiStreamingService.js';
import { createConfigurationService } from '../services/configurationService.js';

/**
 * Controller for conversation processing endpoints
 * Handles the main conversation processing API
 */

/**
 * Main endpoint for processing user messages
 * POST /api/process-message
 */
export async function processMessageController(req, res, pool) {
  try {
    const {
      user_id,
      chatbot_id,
      message_text,
      image_data,
      conversation_history = [],
      session_id,
      configuration = {}
    } = req.body;

    // Validate required fields
    if (!user_id || !chatbot_id || !message_text) {
      return res.status(400).json({
        error: 'Missing required fields',
        details: 'user_id, chatbot_id, and message_text are required'
      });
    }

    console.log('📨 Backend: Processing message request:', {
      user_id,
      chatbot_id,
      message_length: message_text.length,
      has_image: !!image_data,
      session_id
    });

    // Create conversation processing service
    const processingService = createConversationProcessingService(pool);

    // Get full configuration for the chatbot
    const fullConfiguration = await processingService.getConversationConfiguration(chatbot_id);
    const mergedConfiguration = { ...fullConfiguration, ...configuration, chatbot_id };

    // Process the message
    const result = await processingService.processMessage({
      user_id,
      chatbot_id,
      message_text,
      image_data,
      conversation_history,
      session_id,
      configuration: mergedConfiguration
    });

    // Return success response with streaming session info
    res.status(200).json({
      success: true,
      message: 'Message processing started',
      session_id: result.session_id,
      streaming_session_id: result.streaming_session_id,
      flow_type: result.flow_type,
      order_details: result.order_details,
      streaming_url: `/api/stream-events/${result.streaming_session_id}`
    });

  } catch (error) {
    console.error('🚨 Backend: Error in processMessageController:', error);
    
    res.status(500).json({
      error: 'Message processing failed',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Get streaming events for a session
 * GET /api/stream-events/:streamingSessionId
 */
export async function getStreamingEventsController(req, res, pool) {
  try {
    const { streamingSessionId } = req.params;
    const { lastEventId = 0 } = req.query;

    if (!streamingSessionId) {
      return res.status(400).json({
        error: 'Missing streaming session ID'
      });
    }

    const streamingService = createAiStreamingService(pool);
    
    // Get new events since lastEventId
    const events = await streamingService.getStreamingEvents(
      streamingSessionId, 
      parseInt(lastEventId)
    );

    // Get session status
    const sessionStatus = await streamingService.getStreamingSessionStatus(streamingSessionId);

    res.json({
      events,
      session_status: sessionStatus.status,
      last_event_id: events.length > 0 ? events[events.length - 1].id : lastEventId,
      has_more: sessionStatus.status === 'active'
    });

  } catch (error) {
    console.error('🚨 Backend: Error in getStreamingEventsController:', error);
    
    res.status(500).json({
      error: 'Failed to get streaming events',
      details: error.message
    });
  }
}

/**
 * Get conversation configuration for a chatbot
 * GET /api/conversation-config/:chatbotId
 */
export async function getConversationConfigController(req, res, pool) {
  try {
    const { chatbotId } = req.params;

    if (!chatbotId) {
      return res.status(400).json({
        error: 'Missing chatbot ID'
      });
    }

    const configurationService = createConfigurationService(pool);
    const configuration = await configurationService.getFrontendConfiguration(chatbotId);

    res.json({
      success: true,
      configuration
    });

  } catch (error) {
    console.error('🚨 Backend: Error in getConversationConfigController:', error);
    
    res.status(500).json({
      error: 'Failed to get conversation configuration',
      details: error.message
    });
  }
}

/**
 * Upload and process image
 * POST /api/upload-image
 */
export async function uploadImageController(req, res, pool) {
  try {
    const {
      chatbot_id,
      image_data,
      message_text = '',
      configuration = {}
    } = req.body;

    if (!chatbot_id || !image_data) {
      return res.status(400).json({
        error: 'Missing required fields',
        details: 'chatbot_id and image_data are required'
      });
    }

    const processingService = createConversationProcessingService(pool);
    
    // Get full configuration
    const fullConfiguration = await processingService.getConversationConfiguration(chatbot_id);
    const mergedConfiguration = { ...fullConfiguration, ...configuration, chatbot_id };

    // Process the image
    const imageDescription = await processingService.processImage(
      image_data,
      message_text,
      mergedConfiguration
    );

    res.json({
      success: true,
      image_description: imageDescription
    });

  } catch (error) {
    console.error('🚨 Backend: Error in uploadImageController:', error);
    
    res.status(500).json({
      error: 'Image processing failed',
      details: error.message
    });
  }
}

/**
 * Health check endpoint for conversation processing
 * GET /api/conversation-health
 */
export async function conversationHealthController(req, res, pool) {
  try {
    // Check database connectivity
    await pool.query('SELECT 1');
    
    // Check active streaming sessions
    const activeSessionsResult = await pool.query(`
      SELECT COUNT(*) as active_count 
      FROM streaming_sessions 
      WHERE status = 'active' AND created_at > NOW() - INTERVAL '1 hour'
    `);

    const activeStreams = parseInt(activeSessionsResult.rows[0].active_count);

    res.json({
      status: 'healthy',
      database: 'connected',
      active_streams: activeStreams,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('🚨 Backend: Health check failed:', error);
    
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
