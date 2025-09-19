import {
  createConversationService,
  updateConversationResolutionService,
  deleteConversationsService,
  trackChatbotOpenService,
  getConversationsService,
  getConversationCountService,
  getConversationsMetadataService,
  getConversationByIdService,
  markConversationUnreadService,
  flagConversationService,
  updateConversationSubjectService,
  updateConversationService,
  deleteConversationService,
  startConversationUpdateJobService,
  getConversationUpdateJobService,
  getContextChunksService,
  saveContextChunksService,
  getUnreadCommentsCountService,
  getLeadsCountService,
  getUnreadLivechatCountService
} from '../services/conversationsService.js';

/**
 * Create or update a conversation
 */
export async function createConversationController(req, res, pool, SECRET_KEY) {
  try {
    const result = await createConversationService(req.body, req.headers, pool, SECRET_KEY);
    res.status(201).json(result);
  } catch (err) {
    console.error('Error inserting or updating data:', err);
    res.status(500).json({
      error: 'Database error',
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
  }
}

/**
 * Update conversation resolution status
 */
export async function updateConversationResolutionController(req, res, pool) {
  try {
    const result = await updateConversationResolutionService(req.body, pool);
    res.json(result);
  } catch (err) {
    console.error('Error updating conversation resolution:', err);
    if (err.message === 'conversation_id and is_resolved are required') {
      return res.status(400).json({ error: err.message });
    }
    if (err.message === 'Conversation not found') {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: 'Database error', details: err.message });
  }
}

/**
 * Delete conversations by user IDs
 */
export async function deleteConversationsController(req, res, pool) {
  try {
    const result = await deleteConversationsService(req.body, pool);
    res.json(result);
  } catch (error) {
    console.error(error);
    if (error.message === 'userIds must be a non-empty array') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Something went wrong' });
  }
}

/**
 * Track chatbot open for greeting rate statistics
 */
export async function trackChatbotOpenController(req, res, pool) {
  try {
    const result = await trackChatbotOpenService(req.body, pool);
    res.json(result);
  } catch (error) {
    console.error('Error tracking chatbot open:', error);
    if (error.message === 'chatbot_id and user_id are required') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to track chatbot open' });
  }
}

/**
 * Get conversations with filters
 */
export async function getConversationsController(req, res, pool) {
  try {
    const result = await getConversationsService(req.query, pool);
    return res.json(result);
  } catch (err) {
    console.error('Error retrieving data from /conversations:', err);
    if (err.message === 'chatbot_id is required') {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}

/**
 * Get conversation count with filters
 */
export async function getConversationCountController(req, res, pool) {
  try {
    const result = await getConversationCountService(req.query, req.user.userId, pool);
    return res.json(result);
  } catch (err) {
    console.error('Error retrieving metadata from /conversation-count:', err);
    if (err.message === 'chatbot_id is required') {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}

/**
 * Get conversations metadata with filters and pagination
 */
export async function getConversationsMetadataController(req, res, pool) {
  try {
    const result = await getConversationsMetadataService(req.query, req.user.userId, pool);
    return res.json(result);
  } catch (err) {
    console.error('Error retrieving metadata from /conversations-metadata:', err);
    if (err.message === 'chatbot_id is required') {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}

/**
 * Get single conversation by ID
 */
export async function getConversationByIdController(req, res, pool) {
  const { id } = req.params;
  try {
    const conversation = await getConversationByIdService(id, req.user.isAdmin, pool);
    res.json(conversation);
  } catch (err) {
    console.error('Error retrieving conversation:', err);
    if (err.message === 'Conversation not found') {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: 'Database error', details: err.message });
  }
}

/**
 * Mark conversation as unread
 */
export async function markConversationUnreadController(req, res, pool) {
  const { id } = req.params;
  try {
    const result = await markConversationUnreadService(id, pool);
    res.json(result);
  } catch (err) {
    console.error('Error marking conversation as unread:', err);
    if (err.message === 'Conversation not found') {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: 'Database error', details: err.message });
  }
}

/**
 * Flag/unflag conversation (only for livechat conversations)
 */
export async function flagConversationController(req, res, pool) {
  const { id } = req.params;
  try {
    const result = await flagConversationService(id, req.body, pool);
    res.json(result);
  } catch (err) {
    console.error('Error updating conversation flag:', err);
    if (err.message === 'Conversation not found') {
      return res.status(404).json({ error: err.message });
    }
    if (err.message === 'Flagging is only available for livechat conversations') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Database error', details: err.message });
  }
}

/**
 * Update conversation subject (emne) and clear tags
 */
export async function updateConversationSubjectController(req, res, pool) {
  const { id } = req.params;
  try {
    const result = await updateConversationSubjectService(id, req.body, pool);
    res.json(result);
  } catch (err) {
    console.error('Error updating conversation subject:', err);
    if (err.message === 'emne is required and must be a non-empty string') {
      return res.status(400).json({ error: err.message });
    }
    if (err.message === 'Conversation not found') {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: 'Database error', details: err.message });
  }
}

/**
 * Update conversation (PATCH)
 */
export async function updateConversationController(req, res, pool) {
  const conversationId = req.params.id;
  try {
    const result = await updateConversationService(conversationId, req.body, pool);
    res.json(result);
  } catch (err) {
    console.error('Error updating conversation:', err);
    if (err.message === 'At least one of bug_status or lacking_info must be provided') {
      return res.status(400).json({ error: err.message });
    }
    if (err.message === 'Conversation not found') {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: 'Database error', details: err.message });
  }
}

/**
 * Delete conversation by ID
 */
export async function deleteConversationController(req, res, pool) {
  const { id } = req.params;
  const authenticatedUserId = req.user.userId;
  const isAdmin = req.user.isAdmin || req.user.isLimitedAdmin;

  try {
    const result = await deleteConversationService(id, authenticatedUserId, isAdmin, pool);
    return res.json(result);
  } catch (error) {
    console.error('Error deleting conversation:', error);
    if (error.message === 'Conversation not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'User not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'Forbidden: You do not have access to this conversation') {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Database error', details: error.message });
  }
}

/**
 * Start a conversation update job
 */
export async function startConversationUpdateJobController(req, res, pool) {
  try {
    const result = await startConversationUpdateJobService(req.body, pool);
    res.json(result);
  } catch (error) {
    console.error('Error starting conversation update job:', error);
    if (error.message === 'chatbot_id is required') {
      return res.status(400).json({ error: error.message });
    }
    if (error.message === 'No conversations found for the given chatbot_id') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}

/**
 * Get conversation update job status
 */
export async function getConversationUpdateJobController(req, res, pool) {
  const { jobId } = req.params;

  try {
    const job = await getConversationUpdateJobService(jobId, pool);
    res.json(job);
  } catch (error) {
    console.error('Error fetching job status:', error);
    if (error.message === 'Job not found') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Database error', details: error.message });
  }
}

/**
 * Get context chunks for a conversation message
 */
export async function getContextChunksController(req, res, pool) {
  const { id: conversationId, messageIndex } = req.params;
  
  try {
    const chunks = await getContextChunksService(conversationId, messageIndex, pool);
    res.json(chunks);
  } catch (error) {
    console.error('Error retrieving context chunks:', error);
    res.status(500).json({ error: 'Failed to retrieve context chunks' });
  }
}

/**
 * Save context chunks for a conversation message
 */
export async function saveContextChunksController(req, res, pool) {
  const { id: conversationId, messageIndex } = req.params;
  
  try {
    const result = await saveContextChunksService(conversationId, messageIndex, req.body, pool);
    res.json(result);
  } catch (error) {
    console.error('Error saving context chunks:', error);
    res.status(500).json({ error: 'Failed to save context chunks' });
  }
}

/**
 * Get unread comments count
 */
export async function getUnreadCommentsCountController(req, res, pool) {
  try {
    const result = await getUnreadCommentsCountService(req.query, req.user.userId, pool);
    res.json(result);
  } catch (err) {
    console.error('Error fetching unread conversations count:', err);
    if (err.message === 'chatbot_id is required') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Database error', details: err.message });
  }
}

/**
 * Get leads count
 */
export async function getLeadsCountController(req, res, pool) {
  try {
    const result = await getLeadsCountService(req.query, pool);
    res.json(result);
  } catch (err) {
    console.error('Error fetching leads count:', err);
    if (err.message === 'chatbot_id is required') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Database error', details: err.message });
  }
}

/**
 * Get unread livechat count
 */
export async function getUnreadLivechatCountController(req, res, pool) {
  try {
    const result = await getUnreadLivechatCountService(req.query, pool);
    res.json(result);
  } catch (err) {
    console.error('Error fetching unread livechat count:', err);
    if (err.message === 'chatbot_id is required') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Database error', details: err.message });
  }
}
