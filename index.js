import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cron from 'node-cron'; // For scheduled clean-ups
import { generateStatisticsReportTemplate } from './reportGeneratorTemplate.js'; // Import template-based generator
import { analyzeConversations } from './textAnalysis.js'; // Import text analysis
import { generateGPTAnalysis } from './gptAnalysis.js'; // Import GPT analysis
import { registerPromptTemplateV2Routes } from './promptTemplateV2Routes.js';
import { registerFreshdeskRoutes } from './src/routes/freshdeskRoutes.js';
import { createFreshdeskQueueService } from './src/services/freshdeskQueueService.js';
import { processScheduledUploads } from './src/services/scheduledUploadsService.js';
import { checkMissingChunks, checkAllIndexesMissingChunks, getUserIndexes, deleteSpecificVectors } from './pineconeChecker.js';
import { registerPopupMessageRoutes } from './popupMessageRoutes.js';
import { registerSplitTestRoutes } from './splitTestRoutes.js';
import { registerIntegrationRoutes } from './src/routes/integrationRoutes.js';
import { registerMagentoCredentialsRoutes, setMagentoCredentialsPool } from './magentoCredentialsRoutes.js';
import { registerReportRoutes } from './src/routes/reportRoutes.js';
import { registerCommentsRoutes } from './src/routes/commentsRoutes.js';
import { getEmneAndScore } from './src/utils/mainUtils.js';
import { registerBevcoRoutes } from './src/routes/bevcoRoutes.js';
import { registerPineconeRoutes } from './src/routes/pineconeRoutes.js';
import { getPineconeApiKeyForIndex, initializePineconeClient, generateEmbedding } from './src/utils/pineconeUtils.js';
import emailjs from '@emailjs/nodejs';
import { registerGdprRoutes } from './src/routes/gdprRoutes.js';
import { ensureGdprSettingsTable, scheduleGdprCleanup } from './src/utils/gdprUtils.js';
import { runGdprCleanupAllService } from './src/services/gdprService.js';
import { registerShopifyRoutes } from './src/routes/shopifyRoutes.js';
import { registerLivechatRoutes } from './src/routes/livechatRoutes.js';
import { registerUserSettingsRoutes } from './src/routes/userSettingsRoutes.js';
import { registerSupportRoutes } from './src/routes/supportRoutes.js';
import { registerBodylabRoutes } from './src/routes/bodylabRoutes.js';
import { registerAdminRoutes } from './src/routes/adminRoutes.js';
import { registerUsersRoutes } from './src/routes/usersRoutes.js';
import { registerPurchasesRoutes } from './src/routes/purchasesRoutes.js';
import { registerErrorsRoutes } from './src/routes/errorsRoutes.js';
import { registerMagentoRoutes } from './src/routes/magentoRoutes.js';
import { registerStatisticsRoutes } from './src/routes/statisticsRoutes.js';
import { registerConversationsRoutes } from './src/routes/conversationsRoutes.js';
import { registerConversationProcessingRoutes } from './src/routes/conversationProcessingRoutes.js';
import { registerMonitoringRoutes } from './src/routes/monitoringRoutes.js';
import { registerConversationMissingInfoRoutes } from './src/routes/conversationMissingInfoRoutes.js';
import { registerChatbotSettingsRoutes } from './src/routes/chatbotSettingsRoutes.js';
import { ensureConversationUpdateJobsTable } from './src/utils/conversationsUtils.js';
import axios from 'axios';

// Initialize EmailJS with your keys (Node.js format)
emailjs.init({
  publicKey: 'CIcxIuT6fMzBr5cTm',
  privateKey: 'WUW-nxSkm2bsJ4ZJgExNT',
});

const { Pool } = pg;

// Environment variables (or defaults)
const SECRET_KEY = process.env.SECRET_KEY || 'Megtigemaskiner00!';
const PORT = process.env.PORT || 3000;

// Environment-based configuration for background jobs
const isProduction = process.env.NODE_ENV === 'production';
const environment = isProduction ? 'production' : 'development';

// PostgreSQL pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') 
    ? false 
    : { rejectUnauthorized: false }
});

// Cleanup old data periodically
cron.schedule('*/5 * * * *', () => {
  console.log('Cleaning up old data...');
  // Any cleanup logic can go here if needed
});

// Cleanup old conversation update jobs (keep jobs for 7 days)
cron.schedule('0 2 * * *', async () => {
  try {
    console.log('Cleaning up old conversation update jobs...');
    const result = await pool.query(`
      DELETE FROM conversation_update_jobs 
      WHERE created_at < NOW() - INTERVAL '7 days'
      AND status IN ('completed', 'failed', 'cancelled')
    `);
    console.log(`Cleaned up ${result.rowCount} old conversation update jobs`);
  } catch (error) {
    console.error('Error cleaning up old conversation update jobs:', error);
  }
});

// Process Freshdesk ticket queue every minute (production only)
if (isProduction) {
  cron.schedule('* * * * *', async () => {
    try {
      const queueService = createFreshdeskQueueService(pool);
      const result = await queueService.processPendingTickets(10); // Process up to 10 tickets at once

      if (result.processed > 0) {
        console.log(`Freshdesk queue processing (${environment}): ${result.message}`);
      }
    } catch (error) {
      console.error(`Error processing Freshdesk queue (${environment}):`, error);
    }
  });
}

// Process scheduled uploads every minute
cron.schedule('* * * * *', async () => {
  try {
    const result = await processScheduledUploads(pool);
    
    if (result.processed > 0) {
      console.log(`Scheduled uploads processing: Processed ${result.processed} upload(s)`);
    }
  } catch (error) {
    console.error('Error processing scheduled uploads:', error);
  }
});

// Cleanup old Freshdesk queue entries (daily at 3 AM, production only)
if (isProduction) {
  cron.schedule('0 3 * * *', async () => {
    try {
      console.log(`Cleaning up old Freshdesk queue entries (${environment})...`);
      const queueService = createFreshdeskQueueService(pool);
      const cleanedCount = await queueService.cleanupOldTickets();

      if (cleanedCount > 0) {
        console.log(`Cleaned up ${cleanedCount} old Freshdesk queue entries (${environment})`);
      }
    } catch (error) {
      console.error(`Error cleaning up Freshdesk queue (${environment}):`, error);
    }
  });
}

// Cleanup old streaming sessions and events (every hour)
cron.schedule('0 * * * *', async () => {
  try {
    console.log('Cleaning up old streaming sessions...');
    const { createAiStreamingService } = await import('./src/services/aiStreamingService.js');
    const streamingService = createAiStreamingService(pool);
    await streamingService.cleanupOldSessions();
  } catch (error) {
    console.error('Error cleaning up streaming sessions:', error);
  }
});

// Cleanup old performance metrics (daily at 4 AM)
cron.schedule('0 4 * * *', async () => {
  try {
    console.log('Cleaning up old performance metrics...');
    const { createPerformanceTrackingService } = await import('./src/services/performanceTrackingService.js');
    const performanceService = createPerformanceTrackingService(pool);
    await performanceService.cleanupOldMetrics();
  } catch (error) {
    console.error('Error cleaning up performance metrics:', error);
  }
});

// Cleanup expired caches (every 30 minutes)
cron.schedule('*/30 * * * *', async () => {
  try {
    console.log('Cleaning up expired caches...');
    const { cleanupExpiredCache } = await import('./src/utils/cacheUtils.js');
    cleanupExpiredCache();
  } catch (error) {
    console.error('Error cleaning up caches:', error);
  }
});

// Check for required environment variables
if (!process.env.OPENAI_API_KEY) {
  console.error('ERROR: OPENAI_API_KEY environment variable is required');
  process.exit(1);
}

// Initialize Express
const app = express();
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));
// Replace your current CORS configuration with this
app.use(cors({
  origin: '*', // Or ideally specify only allowed domains like 'https://dashboard.dialogintelligens.dk'
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'], // Include all methods you use
  allowedHeaders: ['Content-Type', 'Origin', 'Accept', 'Authorization'], // Add Authorization
  credentials: false, // Set to true if using cookies
  preflightContinue: false,
  optionsSuccessStatus: 204
}));
// Keep this line as well
app.options('*', cors());

// Trust X-Forwarded-For header when behind proxies (Render, Heroku, etc.)
app.set('trust proxy', true);

// Database migration function to update profile_picture column
async function migrateProfilePictureColumn() {
  try {
    // Check if column exists and its type
    const columnCheck = await pool.query(`
      SELECT data_type, character_maximum_length 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'profile_picture'
    `);
    
    if (columnCheck.rows.length > 0) {
      const currentType = columnCheck.rows[0].data_type;
      const maxLength = columnCheck.rows[0].character_maximum_length;
      
      // If it's varchar with limited length, upgrade to TEXT
      if (currentType === 'character varying' && maxLength && maxLength <= 500) {
        console.log('Migrating profile_picture column from varchar to TEXT...');
        await pool.query('ALTER TABLE users ALTER COLUMN profile_picture TYPE TEXT');
        console.log('Successfully migrated profile_picture column to TEXT');
      } else if (currentType === 'text') {
        console.log('profile_picture column is already TEXT type');
      } else {
        console.log(`profile_picture column type: ${currentType}, max_length: ${maxLength}`);
      }
    } else {
      // Column doesn't exist, add it as TEXT
      console.log('Adding profile_picture column as TEXT...');
      await pool.query('ALTER TABLE users ADD COLUMN profile_picture TEXT');
      console.log('Successfully added profile_picture column');
    }
  } catch (error) {
    console.error('Error migrating profile_picture column:', error);
    // Don't exit the process, just log the error
  }
}

// Run migration on startup
migrateProfilePictureColumn();

// JWT auth middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) {
      console.log('JWT verification error:', err);
      return res.sendStatus(403);
    }
    req.user = user;
    next();
  });
}


// New endpoint to check for missing chunks in Pinecone vs database
app.post('/check-missing-chunks', authenticateToken, async (req, res) => {
  const { userId, indexName, namespace } = req.body;
  const requestingUserId = req.user.userId;
  const isAdmin = req.user.isAdmin === true;

  // Validate required parameters
  if (!indexName || !namespace) {
    return res.status(400).json({ error: 'indexName and namespace are required' });
  }

  try {
    // Determine which user's data to check
    let targetUserId = requestingUserId;
    
    // If admin provided a userId, use that instead
    if (isAdmin && userId) {
      targetUserId = userId;
    }

    console.log(`Checking missing chunks for user ${targetUserId}, index: ${indexName}, namespace: ${namespace}`);
    
    const result = await checkMissingChunks(targetUserId, indexName, namespace);
    
    res.json(result);
    
  } catch (error) {
    console.error('Error checking missing chunks:', error);
    res.status(500).json({ 
      error: 'Failed to check missing chunks', 
      details: error.message 
    });
  }
});

// New endpoint to check ALL indexes for missing chunks
app.post('/check-missing-chunks-all', authenticateToken, async (req, res) => {
  const { userId } = req.body;
  const requestingUserId = req.user.userId;
  const isAdmin = req.user.isAdmin === true;

  try {
    if (isAdmin) {
      console.log(`Admin ${requestingUserId} is checking missing chunks for ALL indexes across ALL users`);
      const result = await checkAllIndexesMissingChunks(requestingUserId, true);
      res.json(result);
    } else {
      console.log(`User ${requestingUserId} is checking missing chunks for all their indexes`);
      const result = await checkAllIndexesMissingChunks(requestingUserId, false);
      res.json(result);
    }
    
  } catch (error) {
    console.error('Error checking missing chunks for all indexes:', error);
    res.status(500).json({ 
      error: 'Failed to check missing chunks for all indexes', 
      details: error.message 
    });
  }
});

// Endpoint to search vectors by natural language query using embeddings
app.post('/search-vectors-by-query', authenticateToken, async (req, res) => {
  const { query, userId, indexName, namespace, topK = 5 } = req.body;
  const requestingUserId = req.user.userId;
  const isAdmin = req.user.isAdmin === true;

  // Validate required parameters
  if (!query || !indexName || !namespace) {
    return res.status(400).json({ error: 'query, indexName, and namespace are required' });
  }

  try {
    // Determine which user's data to search
    let targetUserId = requestingUserId;
    if (isAdmin && userId) {
      targetUserId = userId;
    }

    console.log(`Searching vectors for user ${targetUserId}, query: "${query}", index: ${indexName}, namespace: ${namespace}`);
    
    // Generate embedding for the query
    console.log('Generating embedding for query...');
    const queryEmbedding = await generateEmbedding(query);
    console.log('Embedding generated successfully');
    
    // Get Pinecone API key
    console.log('Getting Pinecone API key...');
    const pineconeApiKey = await getPineconeApiKeyForIndex(pool, targetUserId, indexName, namespace);
    
    // Initialize Pinecone client and query
    console.log('Initializing Pinecone client...');
    const pineconeClient = initializePineconeClient(pineconeApiKey);
    const index = pineconeClient.index(namespace);
    
    // Query Pinecone for similar vectors
    console.log(`Querying Pinecone for top ${topK} results...`);
    const queryResponse = await index.query({
      vector: queryEmbedding,
      topK: topK,
      includeMetadata: true
    });
    
    console.log(`Found ${queryResponse.matches?.length || 0} results`);
    
    // Format results
    const results = (queryResponse.matches || []).map(match => ({
      vectorId: match.id,
      score: match.score,
      title: match.metadata?.title || 'No title',
      text: match.metadata?.text || 'No text',
      userId: match.metadata?.userId || match.metadata?.user_id,
      group: match.metadata?.group || 'No group',
      indexName: indexName,
      namespace: namespace,
      metadata: match.metadata
    }));
    
    res.json({
      query: query,
      results: results,
      summary: {
        totalResults: results.length,
        indexName: indexName,
        namespace: namespace
      }
    });
    
  } catch (error) {
    console.error('Error searching vectors by query:', error);
    res.status(500).json({ 
      error: 'Failed to search vectors', 
      details: error.message 
    });
  }
});

// Endpoint to delete specific vectors from Pinecone
app.post('/delete-specific-vectors', authenticateToken, async (req, res) => {
  const { vectorsToDelete } = req.body;
  const requestingUserId = req.user.userId;
  const isAdmin = req.user.isAdmin === true;

  // Validate required parameters
  if (!vectorsToDelete || !Array.isArray(vectorsToDelete) || vectorsToDelete.length === 0) {
    return res.status(400).json({ error: 'vectorsToDelete array is required and must not be empty' });
  }

  try {
    console.log(`User ${requestingUserId} requesting deletion of ${vectorsToDelete.length} vectors`);
    
    const result = await deleteSpecificVectors(requestingUserId, vectorsToDelete, isAdmin);
    
    res.json(result);
    
  } catch (error) {
    console.error('Error deleting specific vectors:', error);
    res.status(500).json({ 
      error: 'Failed to delete vectors', 
      details: error.message 
    });
  }
});


// Initialize the jobs table on startup
ensureConversationUpdateJobsTable(pool);


cron.schedule('0 * * * *', async () => {
  // Runs every hour. Modify interval to your needs
  try {
    const now = new Date();
    const expiredRows = await pool.query(
      `SELECT id, pinecone_vector_id, pinecone_index_name, namespace, user_id
       FROM pinecone_data
       WHERE expiration_time IS NOT NULL AND expiration_time <= $1`,
      [now]
    );

    for (const row of expiredRows.rows) {
      const { id, pinecone_vector_id, pinecone_index_name, namespace, user_id } = row;

      // Get the appropriate Pinecone API key for this index
      try {
        const pineconeApiKey = await getPineconeApiKeyForIndex(pool, user_id, pinecone_index_name, namespace);
        
        const pineconeClient = initializePineconeClient(pineconeApiKey);
        const index = pineconeClient.index(namespace);
        await index.deleteOne(pinecone_vector_id, { namespace: namespace });

        await pool.query('DELETE FROM pinecone_data WHERE id = $1', [id]);
        console.log(`Expired chunk with ID ${id} removed from Pinecone and DB`);
      } catch (keyError) {
        console.error(`Failed to get API key for expired data ID ${id}:`, keyError.message);
        // Continue to next item even if this one fails
      }
    }
  } catch (err) {
    console.error('Error deleting expired data:', err);
  }
});

/* ================================
   Live Chat Statistics Endpoint
================================ */
app.get('/livechat-statistics', authenticateToken, async (req, res) => {
  const { chatbot_id, start_date, end_date } = req.query;

  if (!chatbot_id) {
    return res.status(400).json({ error: 'chatbot_id is required' });
  }

  try {
    // Check if the user has livechat access
    const userCheck = await pool.query(
      'SELECT livechat FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (userCheck.rows.length === 0 || !userCheck.rows[0].livechat) {
      return res.status(403).json({ error: 'User does not have livechat access' });
    }

    const chatbotIds = chatbot_id.split(',');

    // Build base query for livechat conversations
    let queryText = `
      SELECT *
      FROM conversations c
      WHERE c.chatbot_id = ANY($1) AND c.is_livechat = true
    `;
    let queryParams = [chatbotIds];
    let paramIndex = 2;

    // Add date filters if provided
    if (start_date && end_date) {
      queryText += ` AND c.created_at BETWEEN $${paramIndex++} AND $${paramIndex++}`;
      queryParams.push(start_date, end_date);
    }

    queryText += ` ORDER BY c.created_at DESC`;

    const conversationsResult = await pool.query(queryText, queryParams);

    // Get response time statistics from conversation_messages
    let responseTimeQuery = `
      SELECT 
        AVG(cm.response_time_seconds) as avg_response_time,
        MIN(cm.response_time_seconds) as min_response_time,
        MAX(cm.response_time_seconds) as max_response_time,
        COUNT(cm.response_time_seconds) as total_responses
      FROM conversation_messages cm
      JOIN conversations c ON cm.conversation_id = c.id
      WHERE c.chatbot_id = ANY($1) 
        AND c.is_livechat = true 
        AND cm.response_time_seconds IS NOT NULL
        AND cm.agent_name IS NOT NULL
    `;
    let responseTimeParams = [chatbotIds];
    let responseTimeParamIndex = 2;

    if (start_date && end_date) {
      responseTimeQuery += ` AND c.created_at BETWEEN $${responseTimeParamIndex++} AND $${responseTimeParamIndex++}`;
      responseTimeParams.push(start_date, end_date);
    }

    const responseTimeResult = await pool.query(responseTimeQuery, responseTimeParams);

    // Calculate daily conversation counts
    const dailyStats = {};
    conversationsResult.rows.forEach(conv => {
      const date = new Date(conv.created_at);
      const dayKey = `${date.getFullYear()}-${('0' + (date.getMonth() + 1)).slice(-2)}-${('0' + date.getDate()).slice(-2)}`;
      
      if (!dailyStats[dayKey]) {
        dailyStats[dayKey] = 0;
      }
      dailyStats[dayKey]++;
    });

    // Get total AI conversations for percentage calculation
    let aiConversationsQuery = `
      SELECT COUNT(*) as total_ai_conversations
      FROM conversations c
      WHERE c.chatbot_id = ANY($1) AND (c.is_livechat = false OR c.is_livechat IS NULL)
    `;
    let aiConversationsParams = [chatbotIds];
    let aiConversationsParamIndex = 2;

    if (start_date && end_date) {
      aiConversationsQuery += ` AND c.created_at BETWEEN $${aiConversationsParamIndex++} AND $${aiConversationsParamIndex++}`;
      aiConversationsParams.push(start_date, end_date);
    }

    const aiConversationsResult = await pool.query(aiConversationsQuery, aiConversationsParams);

    const totalLivechatConversations = conversationsResult.rows.length;
    const totalAiConversations = parseInt(aiConversationsResult.rows[0].total_ai_conversations);
    const totalConversations = totalLivechatConversations + totalAiConversations;

    // Calculate statistics
    const livechatPercentage = totalConversations > 0 
      ? ((totalLivechatConversations / totalConversations) * 100).toFixed(1)
      : '0.0';

    const avgResponseTime = responseTimeResult.rows[0].avg_response_time 
      ? Math.round(responseTimeResult.rows[0].avg_response_time)
      : null;

    const uniqueDays = Object.keys(dailyStats).length;
    const avgLivechatPerDay = uniqueDays > 0 
      ? (totalLivechatConversations / uniqueDays).toFixed(2)
      : '0.00';

    // Format daily data for charts
    const dailyData = Object.keys(dailyStats).length > 0 ? {
      labels: Object.keys(dailyStats).sort(),
      datasets: [{
        label: 'Daily Live Chat Conversations',
        data: Object.keys(dailyStats).sort().map(key => dailyStats[key]),
        fill: false,
        backgroundColor: '#FF6B6B',
        borderColor: '#FF5252',
        borderWidth: 2,
      }],
    } : null;

    res.json({
      totalLivechatConversations,
      avgLivechatPerDay,
      livechatPercentage: `${livechatPercentage}%`,
      avgResponseTime: avgResponseTime ? `${avgResponseTime}s` : 'N/A',
      minResponseTime: responseTimeResult.rows[0].min_response_time || null,
      maxResponseTime: responseTimeResult.rows[0].max_response_time || null,
      totalResponses: responseTimeResult.rows[0].total_responses || 0,
      dailyData,
      hasResponseTimeData: avgResponseTime !== null,
    });

  } catch (err) {
    console.error('Error retrieving livechat statistics:', err);
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
});

/* ================================
   Public Live Chat Response Time Endpoint
================================ */
app.get('/public/average-response-time/:chatbot_id', async (req, res) => {
  const { chatbot_id } = req.params;

  if (!chatbot_id) {
    return res.status(400).json({ error: 'chatbot_id is required' });
  }

  try {
    // Get response time statistics from conversation_messages
    const responseTimeQuery = `
      SELECT 
        AVG(cm.response_time_seconds) as avg_response_time,
        COUNT(cm.response_time_seconds) as total_responses
      FROM conversation_messages cm
      JOIN conversations c ON cm.conversation_id = c.id
      WHERE c.chatbot_id = $1
        AND c.is_livechat = true 
        AND cm.response_time_seconds IS NOT NULL
        AND cm.agent_name IS NOT NULL
    `;

    const responseTimeResult = await pool.query(responseTimeQuery, [chatbot_id]);
    
    let avgResponseTime = null;
    let hasResponseTimeData = false;
    
    if (responseTimeResult.rows.length > 0 && responseTimeResult.rows[0].avg_response_time) {
      const avgSeconds = Math.round(responseTimeResult.rows[0].avg_response_time);
      
      if (avgSeconds < 60) {
        avgResponseTime = `${avgSeconds}s`;
      } else if (avgSeconds < 3600) {
        const minutes = Math.round(avgSeconds / 60);
        avgResponseTime = `${minutes}m`;
      } else {
        const hours = Math.round(avgSeconds / 3600);
        avgResponseTime = `${hours}h`;
      }
      
      hasResponseTimeData = true;
    }

    res.json({
      avgResponseTime: avgResponseTime || 'N/A',
      hasResponseTimeData,
      totalResponses: responseTimeResult.rows[0]?.total_responses || 0
    });

  } catch (err) {
    console.error('Error retrieving public average response time:', err);
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    details: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
});

/* ================================
   Chatbot Duplication Endpoint
================================ */

// POST duplicate chatbot database settings
app.post('/duplicate-chatbot-settings', authenticateToken, async (req, res) => {
  const { source_chatbot_id, target_chatbot_id } = req.body;
  
  if (!source_chatbot_id || !target_chatbot_id) {
    return res.status(400).json({ error: 'source_chatbot_id and target_chatbot_id are required' });
  }
  
  if (source_chatbot_id === target_chatbot_id) {
    return res.status(400).json({ error: 'source and target chatbot IDs cannot be the same' });
  }
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log(`Duplicating database settings from ${source_chatbot_id} to ${target_chatbot_id}`);
    
    // 1. Duplicate flow_template_assignments
    const templateAssignments = await client.query(
      'SELECT flow_key, template_id FROM flow_template_assignments WHERE chatbot_id = $1',
      [source_chatbot_id]
    );
    
    for (const assignment of templateAssignments.rows) {
      await client.query(
        `INSERT INTO flow_template_assignments (chatbot_id, flow_key, template_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (chatbot_id, flow_key) DO UPDATE SET template_id = $3, updated_at = NOW()`,
        [target_chatbot_id, assignment.flow_key, assignment.template_id]
      );
    }
    console.log(`Duplicated ${templateAssignments.rows.length} template assignments`);
    
    // 2. Duplicate flow_topk_settings
    const topkSettings = await client.query(
      'SELECT flow_key, top_k FROM flow_topk_settings WHERE chatbot_id = $1',
      [source_chatbot_id]
    );
    
    for (const setting of topkSettings.rows) {
      await client.query(
        `INSERT INTO flow_topk_settings (chatbot_id, flow_key, top_k)
         VALUES ($1, $2, $3)
         ON CONFLICT (chatbot_id, flow_key) DO UPDATE SET top_k = $3, updated_at = NOW()`,
        [target_chatbot_id, setting.flow_key, setting.top_k]
      );
    }
    console.log(`Duplicated ${topkSettings.rows.length} topK settings`);
    
    // 3. Duplicate flow_pinecone_api_keys
    const apiKeys = await client.query(
      'SELECT flow_key, pinecone_api_key FROM flow_pinecone_api_keys WHERE chatbot_id = $1',
      [source_chatbot_id]
    );
    
    for (const apiKey of apiKeys.rows) {
      await client.query(
        `INSERT INTO flow_pinecone_api_keys (chatbot_id, flow_key, pinecone_api_key)
         VALUES ($1, $2, $3)
         ON CONFLICT (chatbot_id, flow_key) DO UPDATE SET pinecone_api_key = $3, updated_at = NOW()`,
        [target_chatbot_id, apiKey.flow_key, apiKey.pinecone_api_key]
      );
    }
    console.log(`Duplicated ${apiKeys.rows.length} flow API keys`);
    
    // 4. Duplicate chatbot_language_settings
    const languageSettings = await client.query(
      'SELECT language FROM chatbot_language_settings WHERE chatbot_id = $1',
      [source_chatbot_id]
    );
    
    if (languageSettings.rows.length > 0) {
      await client.query(
        `INSERT INTO chatbot_language_settings (chatbot_id, language, updated_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (chatbot_id) DO UPDATE SET language = $2, updated_at = CURRENT_TIMESTAMP`,
        [target_chatbot_id, languageSettings.rows[0].language]
      );
      console.log(`Duplicated language setting: ${languageSettings.rows[0].language}`);
    }
    
    // 5. Duplicate shopify_credentials
    const shopifyCredentials = await client.query(
      `SELECT shopify_api_key, shopify_secret_key, shopify_store, 
              shopify_access_token, shopify_enabled 
       FROM shopify_credentials WHERE chatbot_id = $1`,
      [source_chatbot_id]
    );
    
    if (shopifyCredentials.rows.length > 0) {
      const cred = shopifyCredentials.rows[0];
      await client.query(
        `INSERT INTO shopify_credentials 
         (chatbot_id, shopify_api_key, shopify_secret_key, shopify_store, 
          shopify_access_token, shopify_enabled)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (chatbot_id) DO UPDATE SET 
           shopify_api_key = $2,
           shopify_secret_key = $3,
           shopify_store = $4,
           shopify_access_token = $5,
           shopify_enabled = $6,
           updated_at = CURRENT_TIMESTAMP`,
        [target_chatbot_id, cred.shopify_api_key, cred.shopify_secret_key, 
         cred.shopify_store, cred.shopify_access_token, cred.shopify_enabled]
      );
      console.log(`Duplicated Shopify credentials`);
    }

    // 6. Duplicate magento_credentials
    const magentoCredentials = await client.query(
      `SELECT magento_consumer_key, magento_consumer_secret, magento_base_url,
              magento_access_token, magento_token_secret, magento_enabled
       FROM magento_credentials WHERE chatbot_id = $1`,
      [source_chatbot_id]
    );

    if (magentoCredentials.rows.length > 0) {
      const cred = magentoCredentials.rows[0];
      await client.query(
        `INSERT INTO magento_credentials
         (chatbot_id, magento_consumer_key, magento_consumer_secret, magento_base_url,
          magento_access_token, magento_token_secret, magento_enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (chatbot_id) DO UPDATE SET
           magento_consumer_key = $2,
           magento_consumer_secret = $3,
           magento_base_url = $4,
           magento_access_token = $5,
           magento_token_secret = $6,
           magento_enabled = $7,
           updated_at = CURRENT_TIMESTAMP`,
        [target_chatbot_id, cred.magento_consumer_key, cred.magento_consumer_secret,
         cred.magento_base_url, cred.magento_access_token, cred.magento_token_secret, cred.magento_enabled]
      );
      console.log(`Duplicated Magento credentials`);
    }

    // 7. Duplicate prompt_overrides
    const promptOverrides = await client.query(
      'SELECT flow_key, section_key, action, content FROM prompt_overrides WHERE chatbot_id = $1',
      [source_chatbot_id]
    );
    
    for (const override of promptOverrides.rows) {
      await client.query(
        `INSERT INTO prompt_overrides (chatbot_id, flow_key, section_key, action, content, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (chatbot_id, flow_key, section_key) 
         DO UPDATE SET action = $4, content = $5, updated_at = NOW()`,
        [target_chatbot_id, override.flow_key, override.section_key, 
         override.action, override.content]
      );
    }
    console.log(`Duplicated ${promptOverrides.rows.length} prompt overrides`);
    
    // 7. Duplicate gdpr_settings
    const gdprSettings = await client.query(
      'SELECT retention_days, enabled FROM gdpr_settings WHERE chatbot_id = $1',
      [source_chatbot_id]
    );
    
    if (gdprSettings.rows.length > 0) {
      const gdpr = gdprSettings.rows[0];
      await client.query(
        `INSERT INTO gdpr_settings (chatbot_id, retention_days, enabled)
         VALUES ($1, $2, $3)
         ON CONFLICT (chatbot_id) DO UPDATE SET 
           retention_days = $2,
           enabled = $3,
           updated_at = CURRENT_TIMESTAMP`,
        [target_chatbot_id, gdpr.retention_days, gdpr.enabled]
      );
      console.log(`Duplicated GDPR settings`);
    }
    
    // 8. Duplicate commercetools_credentials
    const commerceToolsSettings = await client.query(
      `SELECT tracking_auth_url, tracking_client_id, tracking_client_secret,
              tracking_auth_scope, tracking_base_url, tracking_state_name_locale,
              commercetools_enabled
       FROM commercetools_credentials WHERE chatbot_id = $1`,
      [source_chatbot_id]
    );
    
    if (commerceToolsSettings.rows.length > 0) {
      const ct = commerceToolsSettings.rows[0];
      await client.query(
        `INSERT INTO commercetools_credentials
         (chatbot_id, tracking_auth_url, tracking_client_id, tracking_client_secret,
          tracking_auth_scope, tracking_base_url, tracking_state_name_locale,
          commercetools_enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (chatbot_id) DO UPDATE SET
           tracking_auth_url = $2,
           tracking_client_id = $3,
           tracking_client_secret = $4,
           tracking_auth_scope = $5,
           tracking_base_url = $6,
           tracking_state_name_locale = $7,
           commercetools_enabled = $8,
           updated_at = CURRENT_TIMESTAMP`,
        [target_chatbot_id, ct.tracking_auth_url, ct.tracking_client_id,
         ct.tracking_client_secret, ct.tracking_auth_scope, ct.tracking_base_url,
         ct.tracking_state_name_locale, ct.commercetools_enabled]
      );
      console.log(`Duplicated Commerce Tools credentials`);
    }
    
    await client.query('COMMIT');
    
    const summary = {
      template_assignments: templateAssignments.rows.length,
      topk_settings: topkSettings.rows.length,
      api_keys: apiKeys.rows.length,
      language_settings: languageSettings.rows.length,
      shopify_credentials: shopifyCredentials.rows.length,
      magento_credentials: magentoCredentials.rows.length,
      prompt_overrides: promptOverrides.rows.length,
      gdpr_settings: gdprSettings.rows.length,
      commercetools_credentials: commerceToolsSettings.rows.length
    };
    
    res.json({
      success: true,
      message: 'Chatbot database settings duplicated successfully',
      summary
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error duplicating chatbot settings:', error);
    res.status(500).json({ 
      error: 'Failed to duplicate chatbot settings', 
      details: error.message 
    });
  } finally {
    client.release();
  }
});

/* ================================
   NOTIFICATION SETTINGS ENDPOINTS
================================ */

// GET all notification settings for a user
app.get('/notification-settings', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const result = await pool.query(`
      SELECT ns.*
      FROM notification_settings ns
      WHERE ns.user_id = $1 AND ns.is_active = true
      ORDER BY ns.created_at DESC
    `, [userId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching notification settings:', error);
    res.status(500).json({ error: 'Failed to fetch notification settings' });
  }
});

// POST create new notification setting
app.post('/notification-settings', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { emne, procent_stigning, tidsperiode, email, chatbot_id } = req.body;

    console.log('📧 Notification settings request:', {
      userId,
      body: req.body,
      emne,
      procent_stigning,
      tidsperiode,
      email,
      chatbot_id
    });

    // Validation
    if (!emne || !procent_stigning || !tidsperiode || !email) {
      console.log('❌ Validation failed - missing fields:', {
        emne: !!emne,
        procent_stigning: !!procent_stigning,
        tidsperiode: !!tidsperiode,
        email: !!email
      });
      return res.status(400).json({ 
        error: 'Missing required fields: emne, procent_stigning, tidsperiode, and email are required' 
      });
    }

    // Validate percentage values
    const validPercentages = [250, 500, 750, 1000];
    if (!validPercentages.includes(parseInt(procent_stigning))) {
      return res.status(400).json({ 
        error: 'Invalid percentage. Must be one of: 250, 500, 750, 1000' 
      });
    }

    // Validate time periods
    const validPeriods = ['6timer', '12timer', '24timer', '3dage', '7dage'];
    if (!validPeriods.includes(tidsperiode)) {
      return res.status(400).json({ 
        error: 'Invalid time period. Must be one of: 6timer, 12timer, 24timer, 3dage, 7dage' 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    console.log('💾 Inserting into database with values:', [userId, chatbot_id || null, emne, parseInt(procent_stigning), tidsperiode, email]);

    const result = await pool.query(`
      INSERT INTO notification_settings 
      (user_id, chatbot_id, emne, procent_stigning, tidsperiode, email)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [userId, chatbot_id || null, emne, parseInt(procent_stigning), tidsperiode, email]);

    console.log('✅ Successfully created notification setting:', result.rows[0]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error creating notification setting:', error);
    console.error('Database error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      constraint: error.constraint
    });
    res.status(500).json({ error: 'Failed to create notification setting: ' + error.message });
  }
});

// DELETE notification setting (soft delete)
app.delete('/notification-settings/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const result = await pool.query(`
      UPDATE notification_settings 
      SET is_active = false
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [id, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification setting not found' });
    }

    res.json({ message: 'Notification setting deleted successfully' });
  } catch (error) {
    console.error('Error deleting notification setting:', error);
    res.status(500).json({ error: 'Failed to delete notification setting' });
  }
});

// TEST endpoint to manually trigger notification check
app.post('/test-notifications', authenticateToken, async (req, res) => {
  try {
    console.log('🧪 Manual notification test triggered by user:', req.user.userId);
    await checkNotificationTriggers();
    res.json({ message: 'Notification check completed. Check server logs for details.' });
  } catch (error) {
    console.error('❌ Error in manual notification test:', error);
    res.status(500).json({ error: 'Failed to run notification test' });
  }
});

// DEBUG endpoint without authentication
app.get('/debug-notifications', async (req, res) => {
  try {
    console.log('🔧 DEBUG: Manual notification check triggered');
    await checkNotificationTriggers();
    res.json({ message: 'Debug notification check completed. Check server logs for details.' });
  } catch (error) {
    console.error('❌ Error in debug notification test:', error);
    res.status(500).json({ error: 'Failed to run debug notification test' });
  }
});

// DIRECT EMAIL TEST endpoint - sends test email immediately
app.post('/test-email', authenticateToken, async (req, res) => {
  try {
    console.log('📧 Direct email test triggered by user:', req.user.userId);
    
    const testSetting = {
      emne: 'Test Notification',
      email: 'thorkilsen@outlook.com',
      tidsperiode: '6timer',
      procent_stigning: 250
    };
    
    console.log('🚀 Sending test email...');
    await sendNotificationEmail(testSetting, 5, 2, 150);
    
    res.json({ message: 'Test email sent successfully! Check your inbox.' });
  } catch (error) {
    console.error('❌ Error sending test email:', error);
    res.status(500).json({ error: 'Failed to send test email: ' + error.message });
  }
});

/* ================================
   NOTIFICATION MONITORING SYSTEM
================================ */

// Function to check if email cooldown period has passed
async function checkEmailCooldown(setting, timeHours) {
  const { id, last_email_sent, tidsperiode } = setting;
  
  // If no email has been sent yet, cooldown has passed
  if (!last_email_sent) {
    console.log(`✅ No previous email sent for notification ${id}, cooldown passed`);
    return true;
  }
  
  // Calculate cooldown period (double the monitoring time period)
  const cooldownHours = timeHours * 2;
  const cooldownMs = cooldownHours * 60 * 60 * 1000;
  
  const lastEmailTime = new Date(last_email_sent);
  const now = new Date();
  const timeSinceLastEmail = now - lastEmailTime;
  
  const cooldownPassed = timeSinceLastEmail >= cooldownMs;
  
  console.log(`⏰ Cooldown check for notification ${id}:`, {
    tidsperiode,
    timeHours,
    cooldownHours,
    lastEmailSent: lastEmailTime.toISOString(),
    timeSinceLastEmail: Math.round(timeSinceLastEmail / (60 * 60 * 1000) * 10) / 10 + ' hours',
    cooldownPassed
  });
  
  return cooldownPassed;
}

// Function to send notification email and update last_email_sent
async function sendNotificationEmailWithCooldown(setting, currentCount, avgCount, percentageIncrease) {
  try {
    // Send the email
    await sendNotificationEmail(setting, currentCount, avgCount, percentageIncrease);
    
    // Update last_email_sent timestamp
    await pool.query(`
      UPDATE notification_settings 
      SET last_email_sent = CURRENT_TIMESTAMP 
      WHERE id = $1
    `, [setting.id]);
    
    console.log(`📧 Updated last_email_sent for notification ${setting.id}`);
    
  } catch (error) {
    console.error('❌ Error in sendNotificationEmailWithCooldown:', error);
  }
}

// Function to send notification email using your existing EmailJS setup
async function sendNotificationEmail(setting, currentCount, avgCount, percentageIncrease) {
  try {
    const { emne, email, tidsperiode, procent_stigning } = setting;
    
    const subject = `🚨 Usædvanlig aktivitet opdaget: ${emne}`;
    const message = `
Hej,

Vi har opdaget usædvanlig aktivitet på din chatbot:

📊 Aktivitetsrapport
• Emne: ${emne}
• Tidsperiode: ${tidsperiode}
• Nuværende aktivitet: ${currentCount} samtaler
• Normal aktivitet: ${Math.round(avgCount)} samtaler
• Stigning: ${Math.round(percentageIncrease)}% (tærskel: ${procent_stigning}%)

Dette kan indikere øget interesse i dette emne eller potentielle problemer der kræver opmærksomhed.

Log ind på dit dashboard for at se detaljerede statistikker og samtaler.

Med venlig hilsen,
Dit Chatbot Team
    `;

    const templateParams = {
      to_email: email,
      message: message,
      emne: subject,
    };

    // Use your existing EmailJS configuration (Node.js format)
    await emailjs.send(
      'service_n5qoy4e',      // Your service ID
      'template_sbtj6jv',     // Your template ID  
      templateParams,
      {
        publicKey: 'CIcxIuT6fMzBr5cTm',
        privateKey: 'WUW-nxSkm2bsJ4ZJgExNT',
      }
    );
    
    console.log(`✅ Notification email sent to ${email}: ${subject}`);
    
  } catch (error) {
    console.error('❌ Error sending notification email:', error);
  }
}

// Function to check a single notification setting
async function checkSingleNotificationSetting(setting) {
  try {
    const { user_id, chatbot_id, emne, procent_stigning, tidsperiode } = setting;
    
    // Convert time period to hours for calculation
    const timeHours = {
      '6timer': 6,
      '12timer': 12,
      '24timer': 24,
      '3dage': 72,
      '7dage': 168
    }[tidsperiode];

    // Get current period activity
    const currentPeriodStart = new Date(Date.now() - (timeHours * 60 * 60 * 1000));
    
    let chatbotFilter = '';
    let queryParams = [user_id, emne, currentPeriodStart];
    
    if (chatbot_id) {
      chatbotFilter = 'AND c.chatbot_id = $4';
      queryParams.push(chatbot_id);
    }

    // DEBUG: Check what emne values exist for this user
    const debugEmneResult = await pool.query(`
      SELECT DISTINCT c.emne, COUNT(*) as count, c.user_id
      FROM conversations c
      WHERE c.user_id = $1 
        AND c.created_at >= $2
      GROUP BY c.emne, c.user_id
      ORDER BY count DESC
    `, [user_id, currentPeriodStart]);
    
    // DEBUG: Also check ALL recent conversations to see what's available
    const debugAllResult = await pool.query(`
      SELECT DISTINCT c.emne, COUNT(*) as count, c.user_id, 
             MAX(c.created_at) as latest_conversation
      FROM conversations c
      WHERE c.created_at >= $1
      GROUP BY c.emne, c.user_id
      ORDER BY latest_conversation DESC
      LIMIT 10
    `, [currentPeriodStart]);
    
    console.log(`🔍 DEBUG: Available emne values for user ${user_id}:`, debugEmneResult.rows);
    console.log(`🔍 DEBUG: ALL recent conversations (any user):`, debugAllResult.rows);
    console.log(`🔍 DEBUG: Looking for emne: "${emne}" for user_id: ${user_id}`);
    
    // FIXED: Look for conversations with the correct chatbot_id and emne
    console.log(`🔍 DEBUG: Searching for conversations with chatbot_id: ${chatbot_id}, emne: "${emne}"`);
    
    let conversationQuery;
    let conversationQueryParams;
    
    if (chatbot_id) {
      // Search by specific chatbot_id
      conversationQuery = `
        SELECT COUNT(*) as count
        FROM conversations c
        WHERE c.chatbot_id = $1 
          AND c.emne = $2
          AND c.created_at >= $3
      `;
      conversationQueryParams = [chatbot_id, emne, currentPeriodStart];
    } else {
      // If no chatbot_id, search across all conversations for this user's accessible chatbots
      conversationQuery = `
        SELECT COUNT(*) as count
        FROM conversations c
        WHERE c.emne = $1
          AND c.created_at >= $2
      `;
      conversationQueryParams = [emne, currentPeriodStart];
    }
    
    const chatbotConversationResult = await pool.query(conversationQuery, conversationQueryParams);
    
    const currentCount = parseInt(chatbotConversationResult.rows[0].count);
    console.log(`🔍 DEBUG: Found ${currentCount} conversations for chatbot_id: ${chatbot_id}, emne: "${emne}"`);
    
    // Now get the current activity result using the chatbot-based approach
    const currentActivityResult = { rows: [{ current_count: currentCount }] };

    // Get historical average for the same time period using chatbot_id
    const historicalStart = new Date(Date.now() - (timeHours * 60 * 60 * 1000 * 3)); // Last 3 periods (reduced for testing)
    
    let historicalQuery;
    let historicalQueryParams;
    
    if (chatbot_id) {
      historicalQuery = `
        SELECT AVG(daily_count) as avg_count
        FROM (
          SELECT DATE_TRUNC('hour', c.created_at) as hour_bucket, COUNT(*) as daily_count
          FROM conversations c
          WHERE c.chatbot_id = $1 
            AND c.emne = $2 
            AND c.created_at >= $3
            AND c.created_at < $4
          GROUP BY DATE_TRUNC('hour', c.created_at)
        ) hourly_counts
      `;
      historicalQueryParams = [chatbot_id, emne, historicalStart, currentPeriodStart];
    } else {
      historicalQuery = `
        SELECT AVG(daily_count) as avg_count
        FROM (
          SELECT DATE_TRUNC('hour', c.created_at) as hour_bucket, COUNT(*) as daily_count
          FROM conversations c
          WHERE c.emne = $1 
            AND c.created_at >= $2
            AND c.created_at < $3
          GROUP BY DATE_TRUNC('hour', c.created_at)
        ) hourly_counts
      `;
      historicalQueryParams = [emne, historicalStart, currentPeriodStart];
    }
    
    const historicalActivityResult = await pool.query(historicalQuery, historicalQueryParams);

    // currentCount is already defined above
    const avgCount = parseFloat(historicalActivityResult.rows[0].avg_count) || 0;
    
    console.log(`🔍 Detailed analysis for ${emne}:`, {
      currentPeriodStart: currentPeriodStart.toISOString(),
      historicalStart: historicalStart.toISOString(),
      currentCount,
      avgCount,
      timeHours,
      user_id,
      chatbot_id
    });
    
    // Check if enough time has passed since last email (cooldown system)
    const cooldownPassed = await checkEmailCooldown(setting, timeHours);
    
    // Calculate percentage increase
    if (avgCount > 0) {
      const percentageIncrease = ((currentCount - avgCount) / avgCount) * 100;
      
      console.log(`📊 Checking ${emne}: Current=${currentCount}, Avg=${avgCount.toFixed(1)}, Increase=${percentageIncrease.toFixed(1)}%, Threshold=${procent_stigning}%`);
      
      if (percentageIncrease >= procent_stigning) {
        if (cooldownPassed) {
          console.log(`🚨 Threshold exceeded! Sending notification for ${emne}`);
          await sendNotificationEmailWithCooldown(setting, currentCount, avgCount, percentageIncrease);
        } else {
          console.log(`⏰ Threshold exceeded for ${emne}, but cooldown period not yet passed. Skipping email.`);
        }
      }
    } else if (currentCount > 0) {
      // Send notification if there's current activity but no historical data
      if (cooldownPassed) {
        console.log(`🧪 Current activity (${currentCount}) detected with no historical baseline - sending notification`);
        await sendNotificationEmailWithCooldown(setting, currentCount, 0, 100);
      } else {
        console.log(`⏰ Current activity detected for ${emne}, but cooldown period not yet passed. Skipping email.`);
      }
    } else {
      console.log(`📊 No current activity found for ${emne} with chatbot_id: ${chatbot_id}, skipping notification check`);
    }
  } catch (error) {
    console.error('Error checking single notification setting:', error);
  }
}

// Function to check for unusual activity and send notifications
async function checkNotificationTriggers() {
  try {
    console.log('🔍 Checking notification triggers...');
    
    // Get all active notification settings
    const settingsResult = await pool.query(`
      SELECT ns.*
      FROM notification_settings ns
      WHERE ns.is_active = true
    `);

    console.log(`📋 Found ${settingsResult.rows.length} active notification settings`);

    for (const setting of settingsResult.rows) {
      await checkSingleNotificationSetting(setting);
    }
    
    console.log('✅ Notification check completed');
  } catch (error) {
    console.error('❌ Error checking notification triggers:', error);
  }
}

// Set up periodic checking (every 30 minutes)
setInterval(checkNotificationTriggers, 30 * 60 * 1000);

// Also check on startup (after 30 seconds to let server fully initialize)
setTimeout(checkNotificationTriggers, 30000);

// Production ready - using 30-minute interval only

console.log('📧 Notification monitoring system initialized');

// After Express app is initialised and authenticateToken is declared but before app.listen
registerPromptTemplateV2Routes(app, pool, authenticateToken);
registerPopupMessageRoutes(app, pool, authenticateToken);
registerSplitTestRoutes(app, pool, authenticateToken);
registerIntegrationRoutes(app, pool); // Public endpoint - no auth required
registerReportRoutes(app, pool, authenticateToken);

// Initialize GDPR table and routes
ensureGdprSettingsTable(pool).catch(err => console.error('GDPR init error:', err));
registerGdprRoutes(app, pool, authenticateToken);
// Optional scheduler (kept equivalent behavior)
scheduleGdprCleanup(pool, runGdprCleanupAllService);
registerShopifyRoutes(app, pool);
setMagentoCredentialsPool(pool);
registerMagentoCredentialsRoutes(app);
registerFreshdeskRoutes(app, pool);
registerBevcoRoutes(app);
registerLivechatRoutes(app, pool, authenticateToken);
registerUserSettingsRoutes(app, pool, authenticateToken);
registerCommentsRoutes(app, pool, authenticateToken);
registerSupportRoutes(app, pool, authenticateToken);
registerAdminRoutes(app, pool, authenticateToken, getPineconeApiKeyForIndex);
registerUsersRoutes(app, pool, authenticateToken, SECRET_KEY);
registerBodylabRoutes(app);
registerPurchasesRoutes(app, pool, authenticateToken);
registerErrorsRoutes(app, pool);
registerMagentoRoutes(app, pool);
registerStatisticsRoutes(app, pool, authenticateToken);
registerConversationsRoutes(app, pool, authenticateToken, SECRET_KEY);
registerConversationProcessingRoutes(app, pool, authenticateToken);
registerMonitoringRoutes(app, pool, authenticateToken);
registerConversationMissingInfoRoutes(app, pool, authenticateToken);
registerPineconeRoutes(app, pool, authenticateToken);
registerChatbotSettingsRoutes(app, pool, authenticateToken);

/* ================================
   OpenAI Merge Suggestion Endpoint
================================ */
app.post('/api/openai/merge-suggestion', authenticateToken, async (req, res) => {
    try {
        const { prompt, items } = req.body;
        
        if (!prompt || !items || items.length < 1) {
            return res.status(400).json({ error: 'Invalid request. Prompt and at least 1 item is required.' });
        }

        // Import OpenAI
        const { default: OpenAI } = await import('openai');
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });

        // Call OpenAI
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'system',
                    content: 'You are a helpful assistant that analyzes duplicate content and suggests how to merge them into a single, improved version. Provide a clear merged version that combines the best parts of both entries.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.7,
            max_tokens: 2000
        });

        const suggestion = completion.choices[0]?.message?.content;

        if (!suggestion) {
            return res.status(500).json({ error: 'No response from OpenAI' });
        }

        res.json({ suggestion });

  } catch (error) {
        console.error('Error generating merge suggestion:', error);
        res.status(500).json({ 
            error: 'Failed to generate merge suggestion',
            details: error.message 
        });
    }
});

/* ================================
   OpenAI Semantic Duplicate Detection
================================ */
app.post('/api/openai/detect-semantic-duplicates', authenticateToken, async (req, res) => {
    try {
        const { items } = req.body;
        
        if (!items || items.length < 2) {
            return res.json({ duplicates: [] });
        }

        // Import OpenAI
        const { default: OpenAI } = await import('openai');
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });

        // Prepare items for analysis (limit to 50 items to avoid token limits)
        const itemsToAnalyze = items.slice(0, 50).map((item, idx) => ({
            index: idx,
            id: item.id,
            title: item.title || '',
            content: item.text || '',
            server: item.pinecone_index_name || 'unknown',
            environment: item.namespace || 'unknown'
        }));

        const prompt = `You are an expert semantic similarity analyst specializing in chatbot knowledge base content. Your task is to identify entries that convey the same meaning, solve the same problems, or cover the same topics, even when worded differently.

## CRITICAL INSTRUCTIONS:

1. **Server/Environment Context**: Each entry belongs to a specific server/site (pinecone_index_name) and environment/namespace. Entries from different servers/sites are intentionally separate and should NOT be flagged as duplicates, even if semantically similar.

2. **Semantic Similarity Focus**: Find entries that mean the same thing, even if:
   - Different wording/phrasing
   - Different examples or analogies
   - Partial overlap (one covers a subset of the other)
   - Same topic but different depth/detail level
   - Different titles but same core concept

3. **Duplicate Categories to Detect**:
   - **Exact duplicates**: Nearly identical content
   - **Paraphrased duplicates**: Same meaning, different words
   - **Overlapping duplicates**: One entry covers part of what another covers
   - **Related duplicates**: Different aspects of the same problem/topic
   - **Contextual duplicates**: Same answer but different question phrasing

4. **IMPORTANT: Server Separation Rule**
   - If entries have different "server" values (pinecone_index_name), they belong to different sites/languages
   - These should NEVER be flagged as duplicates, regardless of semantic similarity
   - Example: "kundekonto" for Danish site vs "customer account" for French site

5. **High-Confidence Indicators** (>0.85 confidence):
   - Same core solution to same problem
   - Identical process steps or procedures
   - Same policy, rule, or guideline
   - Identical troubleshooting steps

6. **Medium-Confidence Indicators** (0.75-0.85):
   - Same topic with significant content overlap
   - Different approaches to same problem
   - Complementary information on same subject
   - Related procedures or policies

## ANALYSIS GUIDELINES:

**Compare entries for**:
- Core meaning and intent
- Problem being solved
- Solution provided
- Key information conveyed
- User questions addressed
- Process steps or procedures
- Policies, rules, or requirements
- Troubleshooting guidance

**CRITICAL: DO NOT flag as duplicates if**:
- Different "server" values (different sites/languages)
- General vs. specific (e.g., "help" vs. "how to reset password")
- Different problems entirely
- Complementary but distinct topics
- Unrelated procedures or policies

## ENTRIES TO ANALYZE:

${itemsToAnalyze.map((item, i) => `
Entry ${i} (ID: ${item.id}):
Server: ${item.server}
Environment: ${item.environment}
Title: "${item.title}"
Content: "${item.content.substring(0, 1000)}${item.content.length > 1000 ? '...' : ''}"
`).join('\n')}

## RESPONSE FORMAT (STRICT JSON ONLY):

Return ONLY a JSON array with this exact structure:
[
  {
    "index1": 0,
    "index2": 3,
    "confidence": 0.92,
    "reason": "Both entries explain the exact same password reset process with nearly identical steps and requirements"
  },
  {
    "index1": 1,
    "index2": 4,
    "confidence": 0.78,
    "reason": "Both cover account security but with different emphases - one focuses on passwords, the other on 2FA"
  }
]

Rules:
- Use entry indices, not IDs
- Confidence between 0.65-1.0 only
- Include pairs with confidence > 0.75 only
- Reason must be specific and explain the similarity
- Return empty array [] if no duplicates found
- No markdown formatting, no explanations outside JSON

**IMPORTANT**: Only flag duplicates if entries have the SAME server value. Different servers = different sites/languages = intentionally separate content.

Analyze carefully and identify all meaningful duplicates within the same server/environment.`;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'system',
                    content: 'You are a semantic similarity expert. You identify when two pieces of text convey the same meaning, even with different wording.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.3,
            max_tokens: 3000
        });

        const response = completion.choices[0]?.message?.content || '[]';
        
        // Parse the response with improved error handling
        let duplicatePairs = [];
        try {
            const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
            // Remove any trailing commas or invalid JSON characters
            const validJson = cleaned.replace(/,(\s*[}\]])/g, '$1');
            duplicatePairs = JSON.parse(validJson);

            // Validate that we got an array
            if (!Array.isArray(duplicatePairs)) {
                console.warn('Semantic duplicate response is not an array:', duplicatePairs);
                duplicatePairs = [];
            }
        } catch (e) {
            console.warn('Failed to parse semantic duplicate response:', response, e);
            duplicatePairs = [];
        }

        // Map back to original items
        const duplicates = duplicatePairs.map(pair => ({
            items: [
                itemsToAnalyze[pair.index1],
                itemsToAnalyze[pair.index2]
            ],
            confidence: pair.confidence,
            reason: pair.reason
        }));

        res.json({ duplicates });

    } catch (error) {
        console.error('Error detecting semantic duplicates:', error);
        res.status(500).json({ 
            error: 'Failed to detect semantic duplicates',
            details: error.message 
        });
    }
});

/* ================================
   GDPR Compliance Functions
================================ */

// Modify the sendMessage function to save context chunks
// Find the sendMessage function and modify the part where it calls streamAnswer
const sendMessage = async (question = null) => {
  // ... existing code until the streamAnswer call ...
  
  try {
    // ... existing code until the final API call ...
    
    const result = await streamAnswer(apiToUse, bodyObject);
    const finalAIText = result.display;
    let finalAITextWithMarkers = result.withMarkers;
    const contextChunks = result.contextChunks || []; // Get context chunks

    // ... existing code for text processing ...

    const updatedConversationForDisplay = [
      ...updatedConversation,
      { text: displayText, isUser: false },
    ];
    
    const updatedConversationForDB = [
      ...updatedConversation,
      { text: finalAITextWithMarkers, isUser: false },
    ];

    // Run database operations in the background
    (async () => {
      try {
        const { emne, score, lacking_info, fallback } = await getEmneAndScore(
          conversationText,
          null, // userId - not available in this context
          null, // chatbotId - not available in this context
          pool
        );

        // Save conversation to database
        const savedConversation = await saveConversationToDatabase(
          updatedConversationForDB,
          emne,
          score,
          customerRating,
          lacking_info,
          {
            type: "chatbot_response",
            besked: finalAITextWithMarkers.replace(/<[^>]*>/g, ""),
          },
          undefined,
          false,
          fallback
        );

        // Context chunks saving is now handled by the conversations module

      } catch (error) {
        console.error("Error in background database operations:", error);
      }
    })();

    // ... rest of existing code ...
  } catch (error) {
    // ... existing error handling ...
  }
};
// Modify the saveConversationToDatabase function to ensure emails are arrays
// utils/saveConversationToDatabase.js
async function saveConversationToDatabase(
  conversationData,
  emne,
  score,
  customerRating,
  lackingInfo,
  formData = {},
  bugStatus = undefined,
  isLivechat = false,
  fallback = null,
  ligegyldig = null
) {
  try {
    const response = await fetch(
      "https://egendatabasebackend.onrender.com/conversations",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversation_data: conversationData,
          user_id: userId,
          chatbot_id: chatbotID,
          emne: emne,
          score: score,
          ...(customerRating !== null && { customer_rating: customerRating }),
          lacking_info: lackingInfo,
          ...(bugStatus && { bug_status: bugStatus }),
          form_data: formData,
          purchase_tracking_enabled: purchaseTrackingEnabled,
          is_livechat: isLivechat,
          fallback: fallback,
          ligegyldig: ligegyldig,
        }),
      }
    );
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `Failed to save conversation: ${errorData.error}. Details: ${errorData.details}`
      );
    }
    const savedConversation = await response.json();
    console.log("Conversation saved successfully:", savedConversation);
    return savedConversation; // Return the saved conversation object
  } catch (error) {
    console.error("Error saving conversation to the database:", error);
    logError(error);
    return null;
  }
}


/* ================================
   Agent Typing Status Cleanup
================================ */

// Function to clean up old agent typing status records
async function cleanupAgentTypingStatus() {
  try {
    const result = await pool.query(`
      DELETE FROM agent_typing_status 
      WHERE last_updated < NOW() - INTERVAL '1 hour'
    `);
    
    const deletedCount = result.rowCount;
    console.log(`Agent typing status cleanup completed. Deleted ${deletedCount} old records.`);
    return { deletedCount };
  } catch (error) {
    console.error('Error cleaning up agent typing status:', error);
    throw error;
  }
}

// Schedule agent typing status cleanup to run daily at midnight
cron.schedule('0 0 * * *', async () => {
  try {
    console.log('Scheduled agent typing status cleanup starting...');
    const results = await cleanupAgentTypingStatus();
    console.log('Scheduled agent typing status cleanup completed:', results);
  } catch (error) {
    console.error('Scheduled agent typing status cleanup failed:', error);
  }
});

console.log('Agent typing status cleanup scheduled to run daily at midnight');

/* ================================
   Commerce Tools Order Tracking
================================ */

// Cache for commerce tools access tokens
const commerceToolsTokenCache = new Map();

// Function to get commerce tools access token
async function getCommerceToolsToken(credentials) {
  const cacheKey = credentials.chatbot_id;
  const cached = commerceToolsTokenCache.get(cacheKey);
  
  // Check if we have a valid cached token
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }
  
  try {
    const authHeader = Buffer.from(`${credentials.tracking_client_id}:${credentials.tracking_client_secret}`).toString('base64');
    
    const response = await axios.post(credentials.tracking_auth_url, 
      new URLSearchParams({
        grant_type: credentials.tracking_auth_grant_type,
        scope: credentials.tracking_auth_scope
      }), 
      {
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    const token = response.data.access_token;
    const expiresIn = response.data.expires_in || 3600; // Default to 1 hour
    
    // Cache the token with expiration
    commerceToolsTokenCache.set(cacheKey, {
      token,
      expiresAt: Date.now() + (expiresIn * 1000) - 60000 // Subtract 1 minute for safety
    });
    
    return token;
  } catch (error) {
    console.error('Error getting Commerce Tools token:', error.response?.data || error.message);
    throw new Error('Failed to authenticate with Commerce Tools');
  }
}

// Function to fetch order from Commerce Tools with comprehensive processing
async function fetchCommerceToolsOrder(credentials, orderNumber, email) {
  try {
    const token = await getCommerceToolsToken(credentials);
    
    // Build the query URL
    let orderUrl = `${credentials.tracking_base_url}/orders?where=orderNumber="${orderNumber}" and shippingAddress(email="${email}")`;
    
    console.log(`🔍 COMMERCE TOOLS: Fetching order with URL: ${orderUrl}`);
    
    let response = await axios.get(orderUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    let responseData = response.data;
    console.log("🔍 COMMERCE TOOLS: Initial API response:", JSON.stringify(responseData, null, 2));
    
    // If no results found, try with different email case variations
    if (responseData.count === 0 && responseData.total === 0 && email) {
      console.log("🔍 EMAIL RETRY: No results found, trying case variations for email:", email);
      
      const originalEmail = email;
      const emailVariations = [
        originalEmail.toLowerCase(),
        originalEmail.toUpperCase(),
        originalEmail.charAt(0).toUpperCase() + originalEmail.slice(1).toLowerCase()
      ].filter(emailVar => emailVar !== originalEmail);
      
      for (const emailVariation of emailVariations) {
        console.log(`🔍 EMAIL RETRY: Trying email variation: "${emailVariation}"`);
        
        const retryUrl = `${credentials.tracking_base_url}/orders?where=orderNumber="${orderNumber}" and shippingAddress(email="${emailVariation}")`;
        
        try {
          const retryResponse = await axios.get(retryUrl, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          
          console.log(`🔍 EMAIL RETRY: Response for "${emailVariation}":`, JSON.stringify(retryResponse.data, null, 2));
          
          if (retryResponse.data.count > 0 || retryResponse.data.total > 0) {
            console.log(`✅ EMAIL RETRY: Found results with email variation: "${emailVariation}"`);
            responseData = retryResponse.data;
            break;
          }
        } catch (retryError) {
          console.log(`❌ EMAIL RETRY: Failed for "${emailVariation}": ${retryError.response?.status}`);
        }
      }
      
      if (responseData.count === 0 && responseData.total === 0) {
        console.log("🔍 EMAIL RETRY: No results found with any email case variation");
      }
    }
    
    if (responseData.results && responseData.results.length > 0) {
      const order = responseData.results[0];
      
      // Fetch state information for order state
      if (order.state?.id) {
        try {
          const stateUrl = `${credentials.tracking_base_url}/states/${order.state.id}`;
          const stateResponse = await axios.get(stateUrl, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          
          // Add state details to order
          order.stateDetails = stateResponse.data;
          
          // Extract localized state name
          const locale = credentials.tracking_state_name_locale || 'da-DK';
          if (stateResponse.data.name && stateResponse.data.name[locale]) {
            order.localizedStateName = stateResponse.data.name[locale];
          }
          
          // Add overall order state info for easier access
          order.orderStateInfo = {
            id: order.state.id,
            name: stateResponse.data.nameAllLocales?.find(
              (name) => name.locale === locale
            )?.value || stateResponse.data.key || "Unknown"
          };
          
          console.log("Added order state info:", order.orderStateInfo);
          
        } catch (stateError) {
          console.error('Error fetching order state details:', stateError.message);
        }
      }
      
      // Fetch state information for line items
      if (order.lineItems && order.lineItems.length > 0) {
        const lineItemStates = order.lineItems.map(item => {
          return {
            productName: item.name[credentials.tracking_state_name_locale || "da-DK"],
            stateId: item.state?.[0]?.state?.id
          };
        }).filter(item => item.stateId);
        
        console.log("Line item states to fetch:", lineItemStates);
        
        if (lineItemStates.length > 0) {
          const stateIds = lineItemStates.map(item => item.stateId);
          const uniqueStateIds = [...new Set(stateIds)];
          console.log("Unique state IDs to fetch:", uniqueStateIds);
          
          const stateDetails = {};
          
          for (const stateId of uniqueStateIds) {
            try {
              const stateUrl = `${credentials.tracking_base_url}/states/${stateId}`;
              console.log("Fetching line item state details from:", stateUrl);
              
              const stateResponse = await axios.get(stateUrl, {
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
                }
              });
              
              console.log(`State data for ${stateId}:`, stateResponse.data);
              stateDetails[stateId] = stateResponse.data;
              
            } catch (error) {
              console.error(`Error fetching state with ID ${stateId}:`, error.message);
            }
          }
          
          console.log("All line item state details:", stateDetails);
          
          // Add state details to line items
          const locale = credentials.tracking_state_name_locale || "da-DK";
          order.lineItems = order.lineItems.map((item) => {
            const stateId = item.state?.[0]?.state?.id;
            const stateName = stateId && stateDetails[stateId]
              ? stateDetails[stateId].nameAllLocales?.find(
                  (name) => name.locale === locale
                )?.value || stateDetails[stateId].key || "Unknown"
              : "Unknown";
            
            return {
              ...item,
              stateInfo: {
                id: stateId,
                name: stateName
              }
            };
          });
          
          console.log("Enhanced line items with state info:", 
            order.lineItems.map((item) => ({
              product: item.name[locale],
              state: item.stateInfo
            }))
          );
        }
      }
      
      return order;
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching order from Commerce Tools:', error.response?.data || error.message);
    throw error;
  }
}

// Function to extract relevant order details (moved from frontend)
function extractRelevantCommerceToolsOrderDetails(order) {
  console.log("🔍 extractRelevantCommerceToolsOrderDetails - Processing order:", order.orderNumber);
  
  const orderLocale = order.locale || 'da-DK';
  const orderCountry = order.country || orderLocale.split('-')[1]?.toUpperCase();

  const simplifiedLineItems = order.lineItems?.map((item) => {
    let actualUnitPriceCent = item.price.value.centAmount;
    let originalUnitPriceBeforeProductDiscountCent = item.price.value.centAmount;
    let itemCurrencyCode = item.price.value.currencyCode;
    let specificDiscountApplied = false;

    if (item.variant && item.variant.prices && item.variant.prices.length > 0) {
      const relevantPriceEntry = 
        item.variant.prices.find(p => p.country === orderCountry && p.value.currencyCode === itemCurrencyCode) ||
        item.variant.prices.find(p => !p.country && p.value.currencyCode === itemCurrencyCode) || 
        item.variant.prices.find(p => p.country === orderCountry) || 
        item.variant.prices[0];

      if (relevantPriceEntry) {
        originalUnitPriceBeforeProductDiscountCent = relevantPriceEntry.value.centAmount;
        itemCurrencyCode = relevantPriceEntry.value.currencyCode;

        if (relevantPriceEntry.discounted && relevantPriceEntry.discounted.value.centAmount < relevantPriceEntry.value.centAmount) {
          actualUnitPriceCent = relevantPriceEntry.discounted.value.centAmount;
          specificDiscountApplied = true;
        } else {
          actualUnitPriceCent = relevantPriceEntry.value.centAmount;
        }
      }
    }
    
    return {
      productName: item.name[orderLocale] || item.name[Object.keys(item.name)[0]],
      quantity: item.quantity,
      unitPrice: actualUnitPriceCent / 100,
      originalUnitPrice: originalUnitPriceBeforeProductDiscountCent / 100,
      totalLinePrice: (actualUnitPriceCent * item.quantity) / 100,
      currencyCode: itemCurrencyCode,
      state: item.stateInfo?.name || "Unknown",
      sku: item.variant?.sku,
      images: item.variant?.images?.map((img) => img.url) || [],
      specificDiscountApplied: specificDiscountApplied,
    };
  }) || [];

  // Check if discount code was used (cart level discount)
  const hasDiscountCode = order.discountCodes && order.discountCodes.length > 0;
  
  // Construct simplified order object with only relevant information
  return {
    orderNumber: order.orderNumber,
    orderDate: order.createdAt,
    status: order.orderStateInfo?.name || "Unknown",
    customer: {
      firstName: order.shippingAddress?.firstName,
      lastName: order.shippingAddress?.lastName,
      email: order.shippingAddress?.email,
      phone: order.shippingAddress?.phone || order.shippingAddress?.mobile,
    },
    shipping: {
      method: order.shippingInfo?.shippingMethodName,
      address: {
        street: order.shippingAddress?.streetName,
        city: order.shippingAddress?.city,
        postalCode: order.shippingAddress?.postalCode,
        country: order.shippingAddress?.country,
      },
      dropPoint: order.custom?.fields?.["order-field-DeliveryDropPointName"],
      trackingInfo: order.custom?.fields?.["order-field-ShipmentUrl"],
      deliveredDate: order.custom?.fields?.["order-field-DeliveredSetDate"],
    },
    payment: {
      totalPrice: order.totalPrice?.centAmount / 100,
      currencyCode: order.totalPrice?.currencyCode,
    },
    discount: {
      hasDiscountCode: hasDiscountCode,
      discountCodeDetails: hasDiscountCode ? order.discountCodes.map(code => ({
        id: code.discountCode.id,
        state: code.state
      })) : []
    },
    invoiceUrl: order.custom?.fields?.["order-field-PdfUrl"],
    items: simplifiedLineItems,
  };
}

// POST endpoint for order tracking
app.post('/track-order', async (req, res) => {
  const { chatbot_id, order_number, email } = req.body;
  
  if (!chatbot_id || !order_number || !email) {
    return res.status(400).json({ 
      error: 'Missing required fields: chatbot_id, order_number, and email are required' 
    });
  }
  
  try {
    // Get commerce tools credentials for this chatbot
    const credentialsResult = await pool.query(
      `SELECT * FROM commercetools_credentials 
       WHERE chatbot_id = $1 AND commercetools_enabled = true`,
      [chatbot_id]
    );
    
    if (credentialsResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Commerce Tools not configured for this chatbot' 
      });
    }
    
    const credentials = credentialsResult.rows[0];
    
    // Fetch order from Commerce Tools
    const order = await fetchCommerceToolsOrder(credentials, order_number, email);
    
    if (!order) {
      return res.status(404).json({ 
        error: 'Order not found',
        message: 'No order found with the provided order number and email combination'
      });
    }
    
    // Extract relevant order details using the same logic as frontend
    const relevantOrderDetails = extractRelevantCommerceToolsOrderDetails(order);
    
    // Return simplified order information in the format expected by the chatbot
    res.json({
      success: true,
      results: [order], // Keep original format for compatibility
      relevantOrderDetails: relevantOrderDetails, // Add simplified format
      count: 1,
      total: 1
    });
    
  } catch (error) {
    console.error('Error tracking order:', error);
    
    if (error.response?.status === 401) {
      return res.status(401).json({ 
        error: 'Authentication failed',
        message: 'Invalid Commerce Tools credentials'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to track order',
      message: error.message
    });
  }
});

// GET endpoint to check if commerce tools is configured for a chatbot
app.get('/commerce-tools-status/:chatbot_id', async (req, res) => {
  const { chatbot_id } = req.params;
  
  try {
    const result = await pool.query(
      `SELECT commercetools_enabled FROM commercetools_credentials 
       WHERE chatbot_id = $1`,
      [chatbot_id]
    );
    
    if (result.rows.length === 0) {
      return res.json({ 
        configured: false,
        enabled: false
      });
    }
    
    res.json({
      configured: true,
      enabled: result.rows[0].commercetools_enabled
    });
    
  } catch (error) {
    console.error('Error checking Commerce Tools status:', error);
    res.status(500).json({ 
      error: 'Failed to check Commerce Tools status' 
    });
  }
});

// Admin endpoint to update commerce tools credentials (protected)
app.put('/admin/commerce-tools-credentials/:chatbot_id', authenticateToken, async (req, res) => {
  const { chatbot_id } = req.params;
  const isAdmin = req.user.isAdmin === true;
  
  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  const {
    tracking_auth_url,
    tracking_client_id,
    tracking_client_secret,
    tracking_auth_scope,
    tracking_base_url,
    tracking_state_name_locale,
    commercetools_enabled
  } = req.body;
  
  try {
    const result = await pool.query(
      `INSERT INTO commercetools_credentials 
       (chatbot_id, tracking_auth_url, tracking_client_id, tracking_client_secret,
        tracking_auth_scope, tracking_base_url, tracking_state_name_locale, commercetools_enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (chatbot_id) 
       DO UPDATE SET 
         tracking_auth_url = EXCLUDED.tracking_auth_url,
         tracking_client_id = EXCLUDED.tracking_client_id,
         tracking_client_secret = EXCLUDED.tracking_client_secret,
         tracking_auth_scope = EXCLUDED.tracking_auth_scope,
         tracking_base_url = EXCLUDED.tracking_base_url,
         tracking_state_name_locale = EXCLUDED.tracking_state_name_locale,
         commercetools_enabled = EXCLUDED.commercetools_enabled,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [chatbot_id, tracking_auth_url, tracking_client_id, tracking_client_secret,
       tracking_auth_scope, tracking_base_url, tracking_state_name_locale, commercetools_enabled]
    );
    
    // Clear token cache for this chatbot
    commerceToolsTokenCache.delete(chatbot_id);
    
    res.json({
      success: true,
      credentials: {
        ...result.rows[0],
        tracking_client_secret: '***' // Hide secret in response
      }
    });
    
  } catch (error) {
    console.error('Error updating Commerce Tools credentials:', error);
    res.status(500).json({ 
      error: 'Failed to update Commerce Tools credentials' 
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server (${environment}) is running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔧 Background jobs: ${isProduction ? 'ENABLED' : 'DISABLED'}`);
});

// Export pool for use in utility modules
export { pool };