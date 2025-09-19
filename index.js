import { Pinecone } from '@pinecone-database/pinecone';
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import OpenAI from 'openai';
import cron from 'node-cron'; // For scheduled clean-ups
import { generateStatisticsReportTemplate } from './reportGeneratorTemplate.js'; // Import template-based generator
import { analyzeConversations } from './textAnalysis.js'; // Import text analysis
import { generateGPTAnalysis } from './gptAnalysis.js'; // Import GPT analysis
import { registerPromptTemplateV2Routes } from './promptTemplateV2Routes.js';
import { registerFreshdeskRoutes } from './src/routes/freshdeskRoutes.js';
import { createFreshdeskQueueService } from './src/services/freshdeskQueueService.js';
import { checkMissingChunks, checkAllIndexesMissingChunks, getUserIndexes } from './pineconeChecker.js';
import { registerPopupMessageRoutes } from './popupMessageRoutes.js';
import { registerSplitTestRoutes } from './splitTestRoutes.js';
import { registerMagentoCredentialsRoutes, setMagentoCredentialsPool } from './magentoCredentialsRoutes.js';
import { registerReportRoutes } from './src/routes/reportRoutes.js';
import { registerCommentsRoutes } from './src/routes/commentsRoutes.js';
import { getEmneAndScore } from './src/utils/mainUtils.js';
import { registerBevcoRoutes } from './src/routes/bevcoRoutes.js';

const { Pool } = pg;

// Environment variables (or defaults)
const SECRET_KEY = process.env.SECRET_KEY || 'Megtigemaskiner00!';
const PORT = process.env.PORT || 3000;

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

// Process Freshdesk ticket queue every minute
cron.schedule('* * * * *', async () => {
  try {
    const queueService = createFreshdeskQueueService(pool);
    const result = await queueService.processPendingTickets(10); // Process up to 10 tickets at once
    
    if (result.processed > 0) {
      console.log(`Freshdesk queue processing: ${result.message}`);
    }
  } catch (error) {
    console.error('Error processing Freshdesk queue:', error);
  }
});

// Cleanup old Freshdesk queue entries (daily at 3 AM)
cron.schedule('0 3 * * *', async () => {
  try {
    console.log('Cleaning up old Freshdesk queue entries...');
    const queueService = createFreshdeskQueueService(pool);
    const cleanedCount = await queueService.cleanupOldTickets();
    
    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} old Freshdesk queue entries`);
    }
  } catch (error) {
    console.error('Error cleaning up Freshdesk queue:', error);
  }
});

// Check for required environment variables
if (!process.env.OPENAI_API_KEY) {
  console.error('ERROR: OPENAI_API_KEY environment variable is required');
  process.exit(1);
}

// Initialize OpenAI client once
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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

// OpenAI embedding helper
async function generateEmbedding(text) {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: text,
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw new Error('Failed to generate embedding: ' + error.message);
  }
}

// Helper function to get the API key for a specific index or fallback to user's default key
async function getPineconeApiKeyForIndex(userId, indexName, namespace) {
  try {
    // Get user data
    const userResult = await pool.query('SELECT pinecone_api_key, pinecone_indexes FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }
    
    const user = userResult.rows[0];
    let pineconeIndexes = user.pinecone_indexes;
    
    // Parse indexes if it's a string
    if (typeof pineconeIndexes === 'string') {
      pineconeIndexes = JSON.parse(pineconeIndexes);
    }
    
    // Check if pineconeIndexes is an array
    if (Array.isArray(pineconeIndexes)) {
      // Look for the matching index with the specified namespace and index_name
      const matchedIndex = pineconeIndexes.find(index => 
        index.namespace === namespace && 
        index.index_name === indexName && 
        index.API_key
      );
      
      // If found a matching index with API_key, return that key
      if (matchedIndex && matchedIndex.API_key) {
        console.log(`Using index-specific API key for index: ${indexName}, namespace: ${namespace}`);
        return matchedIndex.API_key;
      }
    }
    
    // Fallback to user's default API key
    if (user.pinecone_api_key) {
      console.log(`Using default user API key for index: ${indexName}, namespace: ${namespace}`);
      return user.pinecone_api_key;
    }
    
    throw new Error('No Pinecone API key found for this index or user');
  } catch (error) {
    console.error('Error getting Pinecone API key:', error);
    throw error;
  }
}


/* ================================
   Pinecone Data Endpoints
================================ */
app.post('/pinecone-data', authenticateToken, async (req, res) => {
  const { title, text, indexName, namespace, expirationTime, group } = req.body;
  const authenticatedUserId = req.user.userId;
  
  // Check if user is admin and if a userId parameter was provided
  const isAdmin = req.user.isAdmin === true;
  const targetUserId = isAdmin && req.body.userId ? parseInt(req.body.userId) : authenticatedUserId;

  if (!title || !text || !indexName || !namespace) {
    return res
      .status(400)
      .json({ error: 'Title, text, indexName, and namespace are required' });
  }

  try {
    // If admin is creating data for another user, verify the user exists
    if (isAdmin && targetUserId !== authenticatedUserId) {
      const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [targetUserId]);
      if (userCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Target user not found' });
      }
    }
    
    // Get the appropriate Pinecone API key for this index
    try {
      const pineconeApiKey = await getPineconeApiKeyForIndex(targetUserId, indexName, namespace);
      
      // Generate embedding
      const embedding = await generateEmbedding(text);

      // Initialize Pinecone
      const pineconeClient = new Pinecone({ apiKey: pineconeApiKey });
      
      const index = pineconeClient.index(namespace);

      // Create unique vector ID
      const vectorId = `vector-${Date.now()}`;

      // Prepare vector metadata
      const vectorMetadata = {
        userId: targetUserId.toString(),
        text,
        title,
        metadata: 'true'
      };
      
      // Only add group to metadata if it's defined
      if (group !== undefined && group !== null) {
        vectorMetadata.group = group;
      }

      // Prepare vector
      const vector = {
        id: vectorId,
        values: embedding,
        metadata: vectorMetadata
      };

      // Upsert into Pineconex½
      await index.upsert([vector], { namespace });

      // Convert expirationTime -> Date or set null
      let expirationDateTime = null;
      if (expirationTime) {
        expirationDateTime = new Date(expirationTime);
        if (isNaN(expirationDateTime.getTime())) {
          return res.status(400).json({ error: 'Invalid expirationTime format' });
        }
      }

      // Add group to the metadata field in the database
      const metadata = group ? { group } : {};

      try {
        // Try with metadata column
        const result = await pool.query(
          `INSERT INTO pinecone_data 
            (user_id, title, text, pinecone_vector_id, pinecone_index_name, namespace, expiration_time, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [targetUserId, title, text, vectorId, indexName, namespace, expirationDateTime, JSON.stringify(metadata)]
        );
        // Mark as viewed by the uploader
        const newPineconeDataId = result.rows[0].id;
        await pool.query(
          `INSERT INTO pinecone_data_views (user_id, pinecone_data_id)
           VALUES ($1, $2)
           ON CONFLICT (user_id, pinecone_data_id) DO NOTHING`,
          [targetUserId, newPineconeDataId]
        );
        res.status(201).json(result.rows[0]);
      } catch (dbError) {
        // If metadata column doesn't exist, try without it
        console.error('Error with metadata column, trying without it:', dbError);
        const fallbackResult = await pool.query(
          `INSERT INTO pinecone_data 
            (user_id, title, text, pinecone_vector_id, pinecone_index_name, namespace, expiration_time)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [targetUserId, title, text, vectorId, indexName, namespace, expirationDateTime]
        );
        // Mark as viewed by the uploader (fallback)
        const newPineconeDataIdFallback = fallbackResult.rows[0].id;
        await pool.query(
          `INSERT INTO pinecone_data_views (user_id, pinecone_data_id)
           VALUES ($1, $2)
           ON CONFLICT (user_id, pinecone_data_id) DO NOTHING`,
          [targetUserId, newPineconeDataIdFallback]
        );
        res.status(201).json(fallbackResult.rows[0]);
      }
    } catch (error) {
      console.error('API key error:', error);
      return res.status(400).json({ error: error.message });
    }
  } catch (err) {
    console.error('Error upserting data:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

app.put('/pinecone-data-update/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { title, text, group } = req.body;
  const userId = req.user.userId;
  const isAdmin = req.user.isAdmin === true;

  if (!title || !text) {
    return res.status(400).json({ error: 'Title and text are required' });
  }

  try {
    // Get the user's namespaces from their profile
    const userResult = await pool.query('SELECT pinecone_indexes FROM users WHERE id = $1', [userId]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Extract namespaces from the user's pinecone_indexes
    let pineconeIndexes = userResult.rows[0].pinecone_indexes;
    
    // Parse indexes if it's a string
    if (typeof pineconeIndexes === 'string') {
      pineconeIndexes = JSON.parse(pineconeIndexes);
    }
    
    // Extract all namespaces the user has access to
    const userNamespaces = Array.isArray(pineconeIndexes) 
      ? pineconeIndexes.map(index => index.namespace).filter(Boolean)
      : [];
    
    // Retrieve existing record - for admins or based on namespace access
    const queryText = isAdmin 
      ? 'SELECT * FROM pinecone_data WHERE id = $1'
      : 'SELECT * FROM pinecone_data WHERE id = $1 AND namespace = ANY($2)';
    
    const queryParams = isAdmin ? [id] : [id, userNamespaces];
    
    const dataResult = await pool.query(queryText, queryParams);
    
    if (dataResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Data not found or you do not have permission to modify it. Ensure you have access to the namespace.' 
      });
    }

    const { pinecone_vector_id, pinecone_index_name, namespace, user_id: dataOwnerId, metadata: existingMetadata } = dataResult.rows[0];

    // Get the appropriate Pinecone API key for this index
    try {
      const pineconeApiKey = await getPineconeApiKeyForIndex(dataOwnerId, pinecone_index_name, namespace);
      
      // Generate new embedding
      const embedding = await generateEmbedding(text);
      
      // Parse existing metadata or create new object
      let metadata = {};
      if (existingMetadata) {
        try {
          if (typeof existingMetadata === 'string') {
            metadata = JSON.parse(existingMetadata);
          } else {
            metadata = existingMetadata;
          }
        } catch (e) {
          console.error('Error parsing existing metadata:', e);
        }
      }
      
      // Update group info in metadata
      if (group !== undefined) {
        metadata.group = group;
      }

      // Prepare vector metadata
      const vectorMetadata = {
        userId: dataOwnerId.toString(),
        text,
        title,
        metadata: 'true'
      };
      
      // Only add group to metadata if it's defined
      if (group !== undefined && group !== null) {
        vectorMetadata.group = group;
      } else if (metadata.group) {
        // If there's an existing group in the metadata, use it
        vectorMetadata.group = metadata.group;
      }

      // Update in Pinecone
      const pineconeClient = new Pinecone({ apiKey: pineconeApiKey });

      const index = pineconeClient.index(namespace);
      
      await index.upsert([
        {
          id: pinecone_vector_id,
          values: embedding,
          metadata: vectorMetadata
        },
      ], { namespace });

      try {
        // Try to update with metadata
        const result = await pool.query(
          'UPDATE pinecone_data SET title = $1, text = $2, metadata = $3 WHERE id = $4 RETURNING *',
          [title, text, JSON.stringify(metadata), id]
        );

        // Reset viewed status for all users for this chunk, then mark as viewed for the updater
        const updatedPineconeDataId = result.rows[0].id;
        await pool.query('DELETE FROM pinecone_data_views WHERE pinecone_data_id = $1', [updatedPineconeDataId]);
        await pool.query(
          `INSERT INTO pinecone_data_views (user_id, pinecone_data_id)
           VALUES ($1, $2)
           ON CONFLICT (user_id, pinecone_data_id) DO NOTHING`,
          [userId, updatedPineconeDataId] // userId is req.user.userId (the updater)
        );

        res.json(result.rows[0]);
      } catch (dbError) {
        // If metadata column doesn't exist, try without it
        console.error('Error with metadata column, trying without it:', dbError);
        const fallbackResult = await pool.query(
          'UPDATE pinecone_data SET title = $1, text = $2 WHERE id = $3 RETURNING *',
          [title, text, id]
        );

        // Reset viewed status for all users (fallback), then mark as viewed for the updater
        const updatedPineconeDataIdFallback = fallbackResult.rows[0].id;
        await pool.query('DELETE FROM pinecone_data_views WHERE pinecone_data_id = $1', [updatedPineconeDataIdFallback]);
        await pool.query(
          `INSERT INTO pinecone_data_views (user_id, pinecone_data_id)
           VALUES ($1, $2)
           ON CONFLICT (user_id, pinecone_data_id) DO NOTHING`,
          [userId, updatedPineconeDataIdFallback] // userId is req.user.userId (the updater)
        );

        res.json(fallbackResult.rows[0]);
      }
    } catch (error) {
      console.error('API key error:', error);
      return res.status(400).json({ error: error.message });
    }
  } catch (err) {
    console.error('Error updating data:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Pinecone indexes endpoint moved to Users module

app.get('/pinecone-data', authenticateToken, async (req, res) => {
  // Get the authenticated user's ID
  const authenticatedUserId = req.user.userId;
  
  // Check if user is admin and if a userId parameter was provided
  const isAdmin = req.user.isAdmin === true;
  const requestedUserId = isAdmin && req.query.userId ? parseInt(req.query.userId) : authenticatedUserId;
  
  try {
    // Get the user record to extract their associated namespaces
    const userQuery = isAdmin && requestedUserId !== authenticatedUserId
      ? 'SELECT id, pinecone_indexes FROM users WHERE id = $1'
      : 'SELECT id, pinecone_indexes FROM users WHERE id = $1';
    
    const userResult = await pool.query(userQuery, [requestedUserId]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Requested user not found' });
    }
    
    // Extract namespaces from the user's pinecone_indexes
    const user = userResult.rows[0];
    let pineconeIndexes = user.pinecone_indexes;
    
    // Parse indexes if it's a string
    if (typeof pineconeIndexes === 'string') {
      pineconeIndexes = JSON.parse(pineconeIndexes);
    }
    
    // Extract all namespaces
    const userNamespaces = Array.isArray(pineconeIndexes) 
      ? pineconeIndexes.map(index => index.namespace).filter(Boolean)
      : [];
    
    if (userNamespaces.length === 0) {
      // If no namespaces found, return empty array
      return res.json([]);
    }
    
    // Query pinecone_data where namespace matches any of the user's namespaces
    // Also, join with pinecone_data_views to check if the authenticated user has viewed the data
    const result = await pool.query(
      `SELECT 
         pd.*, 
         CASE WHEN pdv.user_id IS NOT NULL THEN TRUE ELSE FALSE END AS has_viewed
       FROM pinecone_data pd
       LEFT JOIN pinecone_data_views pdv ON pd.id = pdv.pinecone_data_id AND pdv.user_id = $1
       WHERE pd.namespace = ANY($2) 
       ORDER BY pd.created_at DESC`,
      [authenticatedUserId, userNamespaces] // Use authenticatedUserId for the view check
    );
    
    res.json(
      result.rows.map((row) => {
        // Extract group from metadata if available
        let group = null;
        if (row.metadata) {
          try {
            const metadata = typeof row.metadata === 'string'
              ? JSON.parse(row.metadata)
              : row.metadata;
            group = metadata.group;
          } catch (e) {
            console.error('Error parsing metadata:', e);
          }
        }
        
        return {
          title: row.title,
          text: row.text,
          id: row.id,
          pinecone_index_name: row.pinecone_index_name,
          namespace: row.namespace,
          expiration_time: row.expiration_time,
          group: group, // Include group information
          has_viewed: row.has_viewed // Include the has_viewed status
        };
      })
    );
  } catch (err) {
    console.error('Error retrieving data:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

app.delete('/pinecone-data/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;
  const isAdmin = req.user.isAdmin === true;

  try {
    // Get the user's namespaces from their profile
    const userResult = await pool.query('SELECT pinecone_indexes FROM users WHERE id = $1', [userId]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Extract namespaces from the user's pinecone_indexes
    let pineconeIndexes = userResult.rows[0].pinecone_indexes;
    
    // Parse indexes if it's a string
    if (typeof pineconeIndexes === 'string') {
      pineconeIndexes = JSON.parse(pineconeIndexes);
    }
    
    // Extract all namespaces the user has access to
    const userNamespaces = Array.isArray(pineconeIndexes) 
      ? pineconeIndexes.map(index => index.namespace).filter(Boolean)
      : [];

    // Retrieve the record - for admins or based on namespace access
    const queryText = isAdmin 
      ? 'SELECT pinecone_vector_id, pinecone_index_name, namespace, user_id FROM pinecone_data WHERE id = $1'
      : 'SELECT pinecone_vector_id, pinecone_index_name, namespace, user_id FROM pinecone_data WHERE id = $1 AND namespace = ANY($2)';
    
    const queryParams = isAdmin ? [id] : [id, userNamespaces];
    
    const dataResult = await pool.query(queryText, queryParams);
    
    if (dataResult.rows.length === 0) {
      return res.status(404).json({ error: 'Data not found or you do not have permission to delete it. Ensure you have access to the namespace.' });
    }

    const { pinecone_vector_id, pinecone_index_name, namespace, user_id: dataOwnerId } = dataResult.rows[0];

    // Get the appropriate Pinecone API key for this index
    try {
      const pineconeApiKey = await getPineconeApiKeyForIndex(dataOwnerId, pinecone_index_name, namespace);
      
      // Delete from Pinecone
      const pineconeClient = new Pinecone({ apiKey: pineconeApiKey });
      const index = pineconeClient.index(namespace);
      await index.deleteOne(pinecone_vector_id, { namespace: namespace });

      // Delete from DB
      await pool.query('DELETE FROM pinecone_data WHERE id = $1', [id]);

      res.json({ message: 'Data deleted successfully' });
    } catch (error) {
      console.error('API key error:', error);
      return res.status(400).json({ error: error.message });
    }
  } catch (err) {
    console.error('Error deleting data:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// New endpoint to mark Pinecone data as viewed
app.post('/pinecone-data/:data_id/mark-viewed', authenticateToken, async (req, res) => {
  const { data_id } = req.params;
  const userId = req.user.userId;

  if (!data_id) {
    return res.status(400).json({ error: 'data_id is required' });
  }

  try {
    // Check if the pinecone_data entry exists
    const dataCheck = await pool.query('SELECT id FROM pinecone_data WHERE id = $1', [data_id]);
    if (dataCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Pinecone data not found' });
    }

    // Insert a record into pinecone_data_views, or do nothing if it already exists
    await pool.query(
      `INSERT INTO pinecone_data_views (user_id, pinecone_data_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, pinecone_data_id) DO NOTHING`,
      [userId, data_id]
    );

    res.status(200).json({ message: 'Data marked as viewed successfully' });
  } catch (err) {
    console.error('Error marking data as viewed:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

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
        const pineconeApiKey = await getPineconeApiKeyForIndex(user_id, pinecone_index_name, namespace);
        
        const pineconeClient = new Pinecone({ apiKey: pineconeApiKey });
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


// Revenue Analytics endpoint moved to Admin module

// Monthly Conversation Breakdown endpoint moved to Admin module

// User Tracking Statistics endpoint moved to Admin module



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
    
    await client.query('COMMIT');
    
    const summary = {
      template_assignments: templateAssignments.rows.length,
      topk_settings: topkSettings.rows.length,
      api_keys: apiKeys.rows.length,
      language_settings: languageSettings.rows.length,
      shopify_credentials: shopifyCredentials.rows.length,
      magento_credentials: magentoCredentials.rows.length,
      prompt_overrides: promptOverrides.rows.length,
      gdpr_settings: gdprSettings.rows.length
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

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});


// After Express app is initialised and authenticateToken is declared but before app.listen
registerPromptTemplateV2Routes(app, pool, authenticateToken);
registerPopupMessageRoutes(app, pool, authenticateToken);
registerSplitTestRoutes(app, pool, authenticateToken);
registerReportRoutes(app, pool, authenticateToken);
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
import { ensureConversationUpdateJobsTable } from './src/utils/conversationsUtils.js';

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

/* ================================
   GDPR Compliance Functions
================================ */

// Create GDPR settings table

// Add this endpoint after the existing conversation endpoints
app.get('/conversation/:id/context-chunks/:messageIndex', authenticateToken, async (req, res) => {
  const { id: conversationId, messageIndex } = req.params;
  
  try {
    const chunks = await getContextChunks(conversationId, parseInt(messageIndex));
    res.json(chunks);
  } catch (error) {
    console.error('Error retrieving context chunks:', error);
    res.status(500).json({ error: 'Failed to retrieve context chunks' });
  }
});

// POST endpoint to save context chunks
app.post('/conversation/:id/context-chunks/:messageIndex', async (req, res) => {
  const { id: conversationId, messageIndex } = req.params;
  const { chunks } = req.body;
  
  try {
    await saveContextChunks(conversationId, parseInt(messageIndex), chunks);
    res.json({ message: 'Context chunks saved successfully' });
  } catch (error) {
    console.error('Error saving context chunks:', error);
    res.status(500).json({ error: 'Failed to save context chunks' });
  }
});

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

    // ... existing code for conversation processing ...

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

        // Save context chunks if we have them and a conversation ID
        if (contextChunks.length > 0 && savedConversation?.id) {
          const messageIndex = updatedConversationForDB.length - 1; // Index of the AI response
          await saveContextChunks(savedConversation.id, messageIndex, contextChunks);
        }

      } catch (error) {
        console.error("Error in background database operations:", error);
      }
    })();

    // ... rest of existing code ...
  } catch (error) {
    // ... existing error handling ...
  }
};

// Modify the saveConversationToDatabase function to return the conversation ID
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

// Export pool for use in utility modules
export { pool };