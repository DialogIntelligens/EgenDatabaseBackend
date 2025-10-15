import {
  createConversationController,
  updateConversationResolutionController,
  deleteConversationsController,
  getConversationsController,
  getConversationCountController,
  getConversationsMetadataController,
  getConversationByIdController,
  markConversationUnreadController,
  flagConversationController,
  updateConversationSubjectController,
  updateConversationController,
  deleteConversationController,
  startConversationUpdateJobController,
  getConversationUpdateJobController,
  getContextChunksController,
  saveContextChunksController,
  getUnreadCommentsCountController,
  getLeadsCountController,
  getUnreadLivechatCountController,
  getConversationsForExportController
} from '../controllers/conversationsController.js';

/**
 * Register all conversation-related routes
 */
export function registerConversationsRoutes(app, pool, authenticateToken, SECRET_KEY) {
  // POST conversation (public endpoint with optional token verification)
  app.post('/conversations', (req, res) => createConversationController(req, res, pool, SECRET_KEY));

  // POST update conversation resolution status
  app.post('/update-conversation-resolution', authenticateToken, (req, res) => updateConversationResolutionController(req, res, pool));

  // POST delete conversations by user IDs
  app.post('/delete', (req, res) => deleteConversationsController(req, res, pool));

  // GET conversations with filters
  app.get('/conversations', authenticateToken, (req, res) => getConversationsController(req, res, pool));

  // GET conversation count with filters
  app.get('/conversation-count', authenticateToken, (req, res) => getConversationCountController(req, res, pool));

  // GET conversations metadata with filters and pagination
  app.get('/conversations-metadata', authenticateToken, (req, res) => getConversationsMetadataController(req, res, pool));

  // GET single conversation by ID
  app.get('/conversation/:id', authenticateToken, (req, res) => getConversationByIdController(req, res, pool));

  // PATCH mark conversation as unread
  app.patch('/conversation/:id/mark-unread', authenticateToken, (req, res) => markConversationUnreadController(req, res, pool));

  // PATCH flag/unflag conversation (only for livechat conversations)
  app.patch('/conversation/:id/flag', authenticateToken, (req, res) => flagConversationController(req, res, pool));

  // PATCH update conversation subject (emne) and clear tags
  app.patch('/conversation/:id/subject', authenticateToken, (req, res) => updateConversationSubjectController(req, res, pool));

  // PATCH conversation (update bug_status, lacking_info)
  app.patch('/conversations/:id', authenticateToken, (req, res) => updateConversationController(req, res, pool));

  // DELETE conversation by ID
  app.delete('/conversations/:id', authenticateToken, (req, res) => deleteConversationController(req, res, pool));

  // POST start conversation update job
  app.post('/start-conversation-update-job', authenticateToken, (req, res) => startConversationUpdateJobController(req, res, pool));

  // GET conversation update job status
  app.get('/conversation-update-job/:jobId', authenticateToken, (req, res) => getConversationUpdateJobController(req, res, pool));

  // GET context chunks for a conversation message
  app.get('/conversation/:id/context-chunks/:messageIndex', authenticateToken, (req, res) => getContextChunksController(req, res, pool));

  // POST save context chunks for a conversation message
  app.post('/conversation/:id/context-chunks/:messageIndex', (req, res) => saveContextChunksController(req, res, pool));

  // GET unread comments count
  app.get('/unread-comments-count', authenticateToken, (req, res) => getUnreadCommentsCountController(req, res, pool));

  // GET leads count
  app.get('/leads-count', authenticateToken, (req, res) => getLeadsCountController(req, res, pool));

  // GET unread livechat count
  app.get('/unread-livechat-count', authenticateToken, (req, res) => getUnreadLivechatCountController(req, res, pool));

  // GET conversations for export (with specific fields for CSV export)
  app.get('/conversations-for-export', authenticateToken, (req, res) => getConversationsForExportController(req, res, pool));
}
