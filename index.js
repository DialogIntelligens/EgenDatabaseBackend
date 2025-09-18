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
import { checkMissingChunks, checkAllIndexesMissingChunks, getUserIndexes } from './pineconeChecker.js';
import { registerPopupMessageRoutes } from './popupMessageRoutes.js';
import { registerSplitTestRoutes } from './splitTestRoutes.js';
import { registerShopifyCredentialsRoutes, setShopifyCredentialsPool } from './shopifyCredentialsRoutes.js';
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

// moved to bodylabRoutes

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

// Retrieve Pinecone indexes for the user
app.get('/pinecone-indexes', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  try {
    const result = await pool.query('SELECT pinecone_indexes FROM users WHERE id = $1', [userId]);
    const indexes = result.rows[0].pinecone_indexes;
    let parsedIndexes = typeof indexes === 'string' ? JSON.parse(indexes) : indexes;
    
    // Remove API keys from the response for security
    if (Array.isArray(parsedIndexes)) {
      parsedIndexes = parsedIndexes.map(index => ({
        namespace: index.namespace,
        index_name: index.index_name,
        // Exclude API_key from the response
        has_api_key: !!index.API_key, // Just indicate if it has a key
        group: index.group // Include the group property if it exists
      }));
    }
    
    res.json(parsedIndexes);
  } catch (err) {
    console.error('Error retrieving indexes:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

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

// New endpoint to get available indexes for checking
app.get('/user-indexes-for-checking', authenticateToken, async (req, res) => {
  const requestingUserId = req.user.userId;
  const isAdmin = req.user.isAdmin === true;
  const targetUserId = isAdmin && req.query.userId ? parseInt(req.query.userId) : requestingUserId;

  try {
    const indexes = await getUserIndexes(targetUserId);
    
    // Return indexes with useful information for the checker
    const indexInfo = indexes.map(index => ({
      namespace: index.namespace,
      index_name: index.index_name,
      group: index.group || 'No group',
      has_api_key: !!index.API_key
    }));
    
    res.json({
      userId: targetUserId,
      indexes: indexInfo
    });
    
  } catch (error) {
    console.error('Error getting user indexes for checking:', error);
    res.status(500).json({ 
      error: 'Failed to get user indexes', 
      details: error.message 
    });
  }
});

// removed: Registration & Login were moved to usersRoutes


app.delete('/conversations/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const authenticatedUserId = req.user.userId;
  const isAdmin = req.user.isAdmin || req.user.isLimitedAdmin;

  try {
    // Load conversation to verify access
    const convResult = await pool.query(
      'SELECT id, chatbot_id FROM conversations WHERE id = $1',
      [id]
    );
    if (convResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const conversation = convResult.rows[0];

    if (!isAdmin) {
      // Non-admins can delete only conversations tied to chatbots they own
      const userResult = await pool.query(
        'SELECT chatbot_ids FROM users WHERE id = $1',
        [authenticatedUserId]
      );
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      let chatbotIds = userResult.rows[0].chatbot_ids || [];
      if (typeof chatbotIds === 'string') {
        try { chatbotIds = JSON.parse(chatbotIds); } catch (_) { chatbotIds = []; }
      }

      const hasAccess = Array.isArray(chatbotIds) && chatbotIds.includes(conversation.chatbot_id);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Forbidden: You do not have access to this conversation' });
      }
    }

    // Delete conversation
    const result = await pool.query(
      'DELETE FROM conversations WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    return res.json({ message: 'Conversation deleted successfully', deleted: result.rows[0] });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ error: 'Database error', details: error.message });
  }
});



/* ================================
   Conversation Endpoints
================================ */
// PATCH conversation
app.patch('/conversations/:id', authenticateToken, async (req, res) => {
  const conversationId = req.params.id;
  const { bug_status, lacking_info } = req.body;

  if (bug_status === undefined && lacking_info === undefined) {
    return res
      .status(400)
      .json({ error: 'At least one of bug_status or lacking_info must be provided' });
  }

  try {
    const fields = [];
    const values = [];
    let idx = 1;

    if (bug_status !== undefined) {
      fields.push(`bug_status = $${idx++}`);
      values.push(bug_status);
    }
    if (lacking_info !== undefined) {
      fields.push(`lacking_info = $${idx++}`);
      values.push(lacking_info);
    }

    values.push(conversationId);

    const query = `UPDATE conversations SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
    const result = await pool.query(query, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating conversation:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});


    // Helper upsert function
    async function upsertConversation(
      user_id,
      chatbot_id,
      conversation_data,
      emne,
      score,
      customer_rating,
      lacking_info,
      bug_status,
      purchase_tracking_enabled,
      is_livechat = false,
      fallback = null,
      ligegyldig = null,
      tags = null,
      form_data = null,
      is_flagged = false,
      is_resolved = false,
      livechat_email = null,
      split_test_id = null
    ) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Check if this is a livechat conversation with a new user message
        let shouldMarkAsUnread = false;
        let shouldMarkAsUnresolved = false;
        if (is_livechat && conversation_data) {
          try {
            const parsedData = typeof conversation_data === 'string' ? JSON.parse(conversation_data) : conversation_data;
            if (Array.isArray(parsedData) && parsedData.length > 0) {
              const lastMessage = parsedData[parsedData.length - 1];
              // If last message is from user (not agent, not system), mark as unread and unresolved
              if (lastMessage && lastMessage.isUser === true) {
                shouldMarkAsUnread = true;
                shouldMarkAsUnresolved = true; // Automatically unresolve when user sends a message
              }
            }
          } catch (parseError) {
            console.error('Error parsing conversation data for unread check:', parseError);
          }
        }

        const updateResult = await client.query(
          `UPDATE conversations
           SET conversation_data = $3,
               emne = COALESCE($4, emne),
               score = COALESCE($5, score),
               customer_rating = COALESCE($6, customer_rating),
               lacking_info = COALESCE($7, lacking_info),
               bug_status = COALESCE($8, bug_status),
               purchase_tracking_enabled = COALESCE($9, purchase_tracking_enabled),
               is_livechat = COALESCE($10, is_livechat),
               fallback = COALESCE($11, fallback),
               ligegyldig = COALESCE($12, ligegyldig),
               tags = COALESCE($13, tags),
               form_data = COALESCE($14, form_data),
               is_flagged = COALESCE($15, is_flagged),
               is_resolved = CASE WHEN $20 THEN FALSE ELSE COALESCE($16, is_resolved) END,
               viewed = CASE WHEN $19 THEN FALSE ELSE viewed END,
               livechat_email = COALESCE($17, livechat_email),
               split_test_id = COALESCE($18, split_test_id),
               created_at = NOW()
           WHERE user_id = $1 AND chatbot_id = $2
           RETURNING *`,
          [user_id, chatbot_id, conversation_data, emne, score, customer_rating, lacking_info, bug_status, purchase_tracking_enabled, is_livechat, fallback, ligegyldig, tags, form_data, is_flagged, is_resolved, livechat_email, split_test_id, shouldMarkAsUnread, shouldMarkAsUnresolved]
        );

        if (updateResult.rows.length === 0) {
          const insertResult = await client.query(
            `INSERT INTO conversations
             (user_id, chatbot_id, conversation_data, emne, score, customer_rating, lacking_info, bug_status, purchase_tracking_enabled, is_livechat, fallback, ligegyldig, tags, form_data, is_flagged, is_resolved, viewed, livechat_email, split_test_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
             RETURNING *`,
            [user_id, chatbot_id, conversation_data, emne, score, customer_rating, lacking_info, bug_status, purchase_tracking_enabled, is_livechat, fallback, ligegyldig, tags, form_data, is_flagged, shouldMarkAsUnresolved ? false : (is_resolved || false), shouldMarkAsUnread ? false : null, livechat_email, split_test_id]
          );
          await client.query('COMMIT');
          return insertResult.rows[0];
        } else {
          await client.query('COMMIT');
          return updateResult.rows[0];
        }
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

// POST conversation
app.post('/conversations', async (req, res) => {
  let {
    conversation_data,
    user_id,
    chatbot_id,
    emne,
    score,
    customer_rating,
    lacking_info,
    bug_status,
    purchase_tracking_enabled,
    is_livechat,
    fallback,
    ligegyldig,
    tags,
    form_data,
    is_resolved,
    livechat_email,
    split_test_id
  } = req.body;

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const user = jwt.verify(token, SECRET_KEY);
      req.user = user;
      user_id = user.userId; // Override user_id if token is valid
    } catch (err) {
      // If token is invalid/expired, proceed but rely on user_id from body (if present)
      console.warn('Token verification failed, proceeding without authenticated user:', err.message);
    }
  }

  // Ensure user_id is present either from token or body
  if (!user_id) {
    return res.status(400).json({ error: 'Missing user_id and no valid authentication token provided' });
  }
  if (!chatbot_id) {
    return res.status(400).json({ error: 'Missing chatbot_id' });
  }

  try {
    // Stringify the conversation data (which now includes embedded source chunks)
    conversation_data = JSON.stringify(conversation_data);

    // Normalize is_livechat: only update when explicitly provided as boolean; otherwise leave unchanged (null)
    const normalizedIsLivechat = (typeof is_livechat === 'boolean') ? is_livechat : null;

    // Call upsertConversation with is_livechat, fallback, ligegyldig, tags, form_data, is_flagged, and is_resolved parameters
    const result = await upsertConversation(
      user_id,
      chatbot_id,
      conversation_data, // This contains the embedded chunks
      emne,
      score,
      customer_rating,
      lacking_info,
      bug_status,
      purchase_tracking_enabled,
      normalizedIsLivechat,
      fallback,
      ligegyldig,
      tags,
      form_data,
      false, // is_flagged - default to false
      is_resolved || false, // is_resolved - default to false
      livechat_email,
      split_test_id
    );
    res.status(201).json(result);
  } catch (err) {
    console.error('Error inserting or updating data:', err);
    res.status(500).json({
      error: 'Database error',
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
  }
});

// POST update conversation resolution status
app.post('/update-conversation-resolution', authenticateToken, async (req, res) => {
  const { conversation_id, is_resolved } = req.body;

  if (!conversation_id || is_resolved === undefined) {
    return res.status(400).json({ error: 'conversation_id and is_resolved are required' });
  }

  try {
    const result = await pool.query(
      'UPDATE conversations SET is_resolved = $1 WHERE id = $2 RETURNING *',
      [is_resolved, conversation_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating conversation resolution:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// POST delete
app.post('/delete', async (req, res) => {
  const { userIds } = req.body;
  if (!userIds || userIds.length === 0) {
    return res.status(400).json({ error: 'userIds must be a non-empty array' });
  }

  try {
    const result = await pool.query('DELETE FROM conversations WHERE user_id = ANY($1)', [userIds]);
    res.json({ message: 'Conversations deleted successfully', result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// POST track chatbot open for greeting rate statistics
app.post('/track-chatbot-open', async (req, res) => {
  const { chatbot_id, user_id } = req.body;
  
  if (!chatbot_id || !user_id) {
    return res.status(400).json({ error: 'chatbot_id and user_id are required' });
  }

  try {
    // Check if this user+chatbot combination already exists (to avoid duplicates)
    const existingOpen = await pool.query(
      'SELECT id FROM chatbot_opens WHERE chatbot_id = $1 AND user_id = $2',
      [chatbot_id, user_id]
    );

    if (existingOpen.rows.length === 0) {
      // Insert new chatbot open record
      await pool.query(
        'INSERT INTO chatbot_opens (chatbot_id, user_id) VALUES ($1, $2)',
        [chatbot_id, user_id]
      );
      console.log(`Chatbot open tracked: ${chatbot_id} - ${user_id}`);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error tracking chatbot open:', error);
    res.status(500).json({ error: 'Failed to track chatbot open' });
  }
});

/* 
  CHANGED: /conversations now uses comma-separated chatbot_id to match multiple IDs via ANY($1).
*/
app.get('/conversations', authenticateToken, async (req, res) => {
  const { chatbot_id, lacking_info, start_date, end_date } = req.query;

  if (!chatbot_id) {
    return res.status(400).json({ error: 'chatbot_id is required' });
  }

  try {
    // Convert comma-separated IDs into an array
    const chatbotIds = chatbot_id.split(',');

    let queryText = `
      SELECT c.*,
        -- Pre-calculate message counts using PostgreSQL JSON functions
        COALESCE((
          SELECT COUNT(*)
          FROM jsonb_array_elements(c.conversation_data::jsonb) as msg
          WHERE (msg->>'isUser')::boolean = true
        ), 0) as user_message_count,
        COALESCE(jsonb_array_length(c.conversation_data::jsonb), 0) as total_message_count
      FROM conversations c
      WHERE c.chatbot_id = ANY($1)
    `;
    let queryParams = [chatbotIds];
    let paramIndex = 2;

    if (lacking_info === 'true' || lacking_info === 'false') {
      queryText += ` AND c.lacking_info = $${paramIndex++}`;
      queryParams.push(lacking_info === 'true');
    }

    if (start_date && end_date) {
      queryText += ` AND c.created_at BETWEEN $${paramIndex++} AND $${paramIndex++}`;
      queryParams.push(start_date, end_date);
    }

    const result = await pool.query(queryText, queryParams);
    return res.json(result.rows);
  } catch (err) {
    console.error('Error retrieving data from /conversations:', err);
    return res
      .status(500)
      .json({ error: 'Database error', details: err.message });
  }
});

app.get('/conversation-count', authenticateToken, async (req, res) => {
  const { chatbot_id, fejlstatus, customer_rating, emne, tags, is_resolved, has_purchase } = req.query;
  if (!chatbot_id) {
    return res.status(400).json({ error: 'chatbot_id is required' });
  }

  try {
    const chatbotIds = chatbot_id.split(',');
    const userId = req.user.userId;

    let queryText = `
      SELECT COUNT(id) AS conversation_count
      FROM conversations c
      WHERE c.chatbot_id = ANY($1)
    `;
    let queryParams = [chatbotIds];
    let paramIndex = 2;


    if (fejlstatus && fejlstatus !== '') {
      if (fejlstatus === 'livechat') {
        queryText += ` AND c.is_livechat = TRUE`;
      } else if (fejlstatus === 'unread_comments') {
        queryText += ` AND EXISTS (
          SELECT 1 FROM conversation_comments cc
          WHERE cc.conversation_id = c.id
          AND NOT EXISTS (
            SELECT 1 FROM conversation_comment_views ccv
            WHERE ccv.comment_id = cc.id AND ccv.user_id = $${paramIndex++}
          )
        )`;
        queryParams.push(userId);
      } else if (fejlstatus === 'leads') {
        queryText += ` AND c.form_data->>'type' IN ('kontaktformular', 'kundeservice_formular')`;
      } else {
        queryText += ` AND c.bug_status = $${paramIndex++}`;
        queryParams.push(fejlstatus);
      }
    }
    if (has_purchase && has_purchase !== '') {
      if (has_purchase === 'true') {
        queryText += ` AND EXISTS (
          SELECT 1 FROM purchases p
          WHERE p.user_id = c.user_id AND p.chatbot_id = c.chatbot_id AND p.amount > 0
        )`;
      }
    }
    if (customer_rating && customer_rating !== '') {
      queryText += ` AND c.customer_rating = $${paramIndex++}`;
      queryParams.push(customer_rating);
    }
    if (emne && emne !== '') {
      queryText += ` AND c.emne = $${paramIndex++}`;
      queryParams.push(emne);
    }
    if (tags && tags !== '') {
      queryText += ` AND c.tags @> $${paramIndex++}::jsonb`;
      queryParams.push(JSON.stringify([tags]));
    }
    if (is_resolved && is_resolved !== '') {
      if (is_resolved === 'resolved') {
        queryText += ` AND c.is_resolved = TRUE`;
      } else if (is_resolved === 'unresolved') {
        queryText += ` AND (c.is_resolved = FALSE OR c.is_resolved IS NULL)`;
      }
    }
    const result = await pool.query(queryText, queryParams);
    return res.json(result.rows);
  }
  catch (err) {
    console.error('Error retrieving metadata from /conversation-count:', err);
    return res
      .status(500)
      .json({ error: 'Database error', details: err.message });
  }
});

// GET greeting rate statistics
app.get('/greeting-rate', authenticateToken, async (req, res) => {
  const { chatbot_id, start_date, end_date } = req.query;
  
  if (!chatbot_id) {
    return res.status(400).json({ error: 'chatbot_id is required' });
  }

  try {
    const chatbotIds = chatbot_id.split(',');
    
    // Base query parameters
    let queryParams = [chatbotIds];
    let paramIndex = 2;
    let dateFilter = '';

    // Add date filtering if provided
    if (start_date && end_date) {
      dateFilter = ` AND opened_at BETWEEN $${paramIndex++} AND $${paramIndex++}`;
      queryParams.push(start_date, end_date);
    }

    // Query to get total chatbot opens
    const opensQuery = `
      SELECT COUNT(DISTINCT user_id) AS total_opens
      FROM chatbot_opens
      WHERE chatbot_id = ANY($1)${dateFilter}
    `;
    
    const opensResult = await pool.query(opensQuery, queryParams);
    const totalOpens = parseInt(opensResult.rows[0]?.total_opens || 0);

    // Query to get total conversations (users who actually had conversations)
    // For existing chatbots, we need to be smart about the date range
    let conversationDateFilter = '';
    let conversationParams = [chatbotIds];
    let conversationParamIndex = 2;

    // If no date filter is provided, check if this chatbot has tracking data
    if (!start_date || !end_date) {
      // Get the earliest chatbot open date for these chatbots
      const firstOpenQuery = `
        SELECT MIN(opened_at) as first_open_date
        FROM chatbot_opens
        WHERE chatbot_id = ANY($1)
      `;
      const firstOpenResult = await pool.query(firstOpenQuery, [chatbotIds]);
      const firstOpenDate = firstOpenResult.rows[0]?.first_open_date;

      if (firstOpenDate) {
        // Only count conversations from when tracking started
        conversationDateFilter = ` AND c.created_at >= $${conversationParamIndex++}`;
        conversationParams.push(firstOpenDate);
        console.log('Using first open date for greeting rate calculation:', firstOpenDate);
      } else {
        // No opens tracked yet, so greeting rate should be N/A
        return res.json({
          total_opens: 0,
          total_conversations: 0,
          greeting_rate_percentage: 0,
          note: 'No chatbot opens tracked yet'
        });
      }
    } else {
      // Use provided date range
      conversationDateFilter = ` AND c.created_at BETWEEN $${conversationParamIndex++} AND $${conversationParamIndex++}`;
      conversationParams.push(start_date, end_date);
    }

    const conversationsQuery = `
      SELECT COUNT(DISTINCT c.user_id) AS total_conversations
      FROM conversations c
      WHERE c.chatbot_id = ANY($1)${conversationDateFilter}
    `;
    
    const conversationsResult = await pool.query(conversationsQuery, conversationParams);
    const totalConversations = parseInt(conversationsResult.rows[0]?.total_conversations || 0);

    // Calculate greeting rate
    let greetingRate = 0;
    let note = null;
    
    if (totalOpens > 0) {
      greetingRate = Math.round((totalConversations / totalOpens) * 100);
      // Cap at 100% as greeting rate shouldn't exceed 100%
      greetingRate = Math.min(greetingRate, 100);
    } else if (totalConversations > 0) {
      // This shouldn't happen with our new logic, but just in case
      note = 'Tracking data incomplete';
    }

    return res.json({
      total_opens: totalOpens,
      total_conversations: totalConversations,
      greeting_rate_percentage: greetingRate,
      ...(note && { note })
    });

  } catch (err) {
    console.error('Error calculating greeting rate:', err);
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
});

/* 
  CHANGED: /conversations-metadata also uses ANY($1) for multiple IDs.
*/
app.get('/conversations-metadata', authenticateToken, async (req, res) => {
  const { chatbot_id, page_number, page_size, lacking_info, start_date, end_date, conversation_filter, fejlstatus, customer_rating, emne, tags, is_resolved, is_livechat_page, has_purchase } = req.query;

  if (!chatbot_id) {
    return res.status(400).json({ error: 'chatbot_id is required' });
  }

  try {
    const chatbotIds = chatbot_id.split(',');
    const userId = req.user.userId;

    let queryText = `
      SELECT c.id, c.created_at, c.emne, c.customer_rating, c.bug_status, c.conversation_data, c.viewed, c.tags, c.is_flagged, c.form_data, c.user_id, c.livechat_email,
             COALESCE(SUM(p.amount), 0) as purchase_amount,
             CASE 
               WHEN EXISTS (
                 SELECT 1 FROM conversation_comments cc
                 WHERE cc.conversation_id = c.id
                 AND NOT EXISTS (
                   SELECT 1 FROM conversation_comment_views ccv
                   WHERE ccv.comment_id = cc.id AND ccv.user_id = $2
                 )
               ) THEN TRUE
               ELSE FALSE
             END as has_unread_comments,
             CASE 
               WHEN c.is_livechat = TRUE AND c.uses_message_system = TRUE THEN
                 COALESCE(
                   (SELECT cm.created_at FROM conversation_messages cm 
                    WHERE cm.conversation_id = c.id 
                    AND (cm.is_system = TRUE OR cm.agent_name IS NOT NULL)
                    ORDER BY cm.sequence_number ASC 
                    LIMIT 1),
                   c.created_at
                 )
               ELSE c.created_at
             END as sort_timestamp
      FROM conversations c
      LEFT JOIN purchases p ON c.user_id = p.user_id AND c.chatbot_id = p.chatbot_id
      WHERE c.chatbot_id = ANY($1)
    `;
    let queryParams = [chatbotIds, userId];
    let paramIndex = 3;

    if (lacking_info === 'true' || lacking_info === 'false') {
      queryText += ` AND c.lacking_info = $${paramIndex++}`;
      queryParams.push(lacking_info === 'true');
    }

    if (start_date && end_date) {
      queryText += ` AND c.created_at BETWEEN $${paramIndex++} AND $${paramIndex++}`;
      queryParams.push(start_date, end_date);
    }
    if (fejlstatus && fejlstatus !== '') {
      if (fejlstatus === 'livechat') {
        queryText += ` AND c.is_livechat = TRUE`;
      } else if (fejlstatus === 'unread_comments') {
        queryText += ` AND EXISTS (
          SELECT 1 FROM conversation_comments cc
          WHERE cc.conversation_id = c.id
          AND NOT EXISTS (
            SELECT 1 FROM conversation_comment_views ccv
            WHERE ccv.comment_id = cc.id AND ccv.user_id = $2
          )
        )`;
      } else if (fejlstatus === 'leads') {
        queryText += ` AND c.form_data->>'type' IN ('kontaktformular', 'kundeservice_formular')`;
      } else if (fejlstatus === 'flagged') {
        queryText += ` AND c.is_flagged = TRUE`;
      } else {
        queryText += ` AND c.bug_status = $${paramIndex++}`;
        queryParams.push(fejlstatus);
      }
    }
    if (has_purchase && has_purchase !== '') {
      if (has_purchase === 'true') {
        queryText += ` AND EXISTS (
          SELECT 1 FROM purchases p
          WHERE p.user_id = c.user_id AND p.chatbot_id = c.chatbot_id AND p.amount > 0
        )`;
      }
    }
    if (customer_rating && customer_rating !== '') {
      queryText += ` AND c.customer_rating = $${paramIndex++}`;
      queryParams.push(customer_rating);
    }
    if (emne && emne !== '') {
      queryText += ` AND c.emne = $${paramIndex++}`;
      queryParams.push(emne);
    }
    if (conversation_filter && conversation_filter.trim() !== '') {
      queryText += ` AND c.conversation_data::text ILIKE '%' || $${paramIndex++} || '%'`;
      queryParams.push(`${conversation_filter}`);
    }
    if (is_resolved && is_resolved !== '') {
      if (is_resolved === 'resolved') {
        queryText += ` AND c.is_resolved = TRUE`;
      } else if (is_resolved === 'unresolved') {
        queryText += ` AND (c.is_resolved = FALSE OR c.is_resolved IS NULL)`;
      }
    }

    queryText += ` GROUP BY c.id `;
    
    // Use different sorting logic for livechat page
    if (is_livechat_page === 'true') {
      // For livechat page: sort by first live message timestamp (when livechat started)
      queryText += ` ORDER BY sort_timestamp DESC `;
    } else {
      // For normal conversations page: sort by created_at (newest first)
      queryText += ` ORDER BY c.created_at DESC `;
    }
    
    queryText += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++} `;
    queryParams.push(page_size, page_number * page_size);

    const result = await pool.query(queryText, queryParams);
    return res.json(result.rows);
  } catch (err) {
    console.error('Error retrieving metadata from /conversations-metadata:', err);
    return res
      .status(500)
      .json({ error: 'Database error', details: err.message });
  }
});

// GET single conversation
app.get('/conversation/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    // Get the conversation with purchase data
    const result = await pool.query(
      `SELECT c.*, 
              COALESCE(SUM(p.amount), 0) as purchase_amount
       FROM conversations c
       LEFT JOIN purchases p ON c.user_id = p.user_id AND c.chatbot_id = p.chatbot_id
       WHERE c.id = $1
       GROUP BY c.id`, 
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    let conversation = result.rows[0];

    // If this is a livechat conversation, enrich with file metadata from atomic messages
    if (conversation.is_livechat) {
      try {
        // Read file metadata from atomic conversation_messages metadata JSONB
        const cmResult = await pool.query(
          `SELECT message_text, metadata
           FROM conversation_messages
           WHERE conversation_id = $1
           ORDER BY sequence_number ASC`,
          [conversation.id]
        );

        // Parse existing conversation data
        let conversationData = [];
        if (conversation.conversation_data) {
          try {
            conversationData = typeof conversation.conversation_data === 'string'
              ? JSON.parse(conversation.conversation_data)
              : conversation.conversation_data;
          } catch (e) {
            console.error('Error parsing conversation_data:', e);
            conversationData = [];
          }
        }

        // Enrich conversation data with file metadata from metadata field
        if (cmResult.rows.length > 0 && conversationData.length > 0) {
          const messageMap = new Map();
          cmResult.rows.forEach(row => {
            const meta = row.metadata || {};
            if (meta.fileName || meta.fileMime) {
              messageMap.set(row.message_text, {
                fileName: meta.fileName || null,
                fileMime: meta.fileMime || null
              });
            }
          });

          // Update conversation data with file metadata
          conversationData = conversationData.map(msg => {
            if (msg.image && msg.text && messageMap.has(msg.text)) {
              const fileMetadata = messageMap.get(msg.text);
              return {
                ...msg,
                fileName: fileMetadata.fileName,
                fileMime: fileMetadata.fileMime
              };
            }
            return msg;
          });

          conversation.conversation_data = conversationData;
        }
      } catch (error) {
        console.error('Error enriching livechat conversation with file metadata (atomic):', error);
        // Continue without enrichment if there's an error
      }
    }
    
    // Only mark the conversation as viewed if the user is not an admin
    if (!req.user.isAdmin) {
      await pool.query('UPDATE conversations SET viewed = TRUE WHERE id = $1', [id]);
    }
    
    res.json(conversation);
  } catch (err) {
    console.error('Error retrieving conversation:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// PATCH to mark conversation as unread
app.patch('/conversation/:id/mark-unread', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'UPDATE conversations SET viewed = FALSE WHERE id = $1 RETURNING *', 
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error marking conversation as unread:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// PATCH to flag/unflag conversation (only for livechat conversations)
app.patch('/conversation/:id/flag', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { is_flagged } = req.body;
  
  try {
    // First verify this is a livechat conversation
    const checkResult = await pool.query(
      'SELECT is_livechat FROM conversations WHERE id = $1',
      [id]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    if (!checkResult.rows[0].is_livechat) {
      return res.status(400).json({ error: 'Flagging is only available for livechat conversations' });
    }
    
    // Update the flag status
    const result = await pool.query(
      'UPDATE conversations SET is_flagged = $1 WHERE id = $2 RETURNING *', 
      [is_flagged, id]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating conversation flag:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// PATCH to update conversation subject (emne) and clear tags
app.patch('/conversation/:id/subject', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { emne } = req.body;
  
  if (!emne || typeof emne !== 'string' || emne.trim() === '') {
    return res.status(400).json({ error: 'emne is required and must be a non-empty string' });
  }
  
  try {
    // Update the conversation subject and clear tags
    const result = await pool.query(
      'UPDATE conversations SET emne = $1, tags = NULL WHERE id = $2 RETURNING *', 
      [emne.trim(), id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating conversation subject:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

/* ================================
   update-conversations Endpoint (Job-based with progress tracking)
================================ */

// Database schema for conversation update jobs
async function ensureConversationUpdateJobsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversation_update_jobs (
        id SERIAL PRIMARY KEY,
        chatbot_id TEXT NOT NULL,
        user_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        total_conversations INTEGER DEFAULT 0,
        processed_conversations INTEGER DEFAULT 0,
        successful_conversations INTEGER DEFAULT 0,
        failed_conversations INTEGER DEFAULT 0,
        limit_count INTEGER,
        error_message TEXT,
        progress_percentage INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Check if we need to alter the existing table to change user_id from INTEGER to TEXT
    const columnCheck = await pool.query(`
      SELECT data_type 
      FROM information_schema.columns 
      WHERE table_name = 'conversation_update_jobs' AND column_name = 'user_id'
    `);
    
    if (columnCheck.rows.length > 0 && columnCheck.rows[0].data_type === 'integer') {
      console.log('Migrating conversation_update_jobs.user_id from INTEGER to TEXT...');
      await pool.query('ALTER TABLE conversation_update_jobs ALTER COLUMN user_id TYPE TEXT');
      console.log('Successfully migrated user_id column to TEXT');
    }
    
    console.log('Conversation update jobs table ensured');
  } catch (error) {
    console.error('Error creating conversation update jobs table:', error);
  }
}

// Initialize the jobs table on startup
ensureConversationUpdateJobsTable();

// Start a conversation update job
app.post('/start-conversation-update-job', authenticateToken, async (req, res) => {
  const { chatbot_id, limit } = req.body;

  if (!chatbot_id) {
    return res.status(400).json({ error: 'chatbot_id is required' });
  }

  try {
    // First, count total conversations to be processed
    let countQuery = 'SELECT COUNT(*) as total FROM conversations WHERE chatbot_id = $1';
    let countParams = [chatbot_id];
    
    if (limit && limit > 0) {
      countQuery = `
        SELECT COUNT(*) as total FROM (
          SELECT id FROM conversations
          WHERE chatbot_id = $1
          ORDER BY created_at DESC
          LIMIT $2
        ) AS limited_conversations
      `;
      countParams.push(limit);
    }
    
    const countResult = await pool.query(countQuery, countParams);
    const totalConversations = parseInt(countResult.rows[0].total);
    
    if (totalConversations === 0) {
      return res.status(404).json({ error: 'No conversations found for the given chatbot_id' });
    }

    // Get userId from a conversation
    const userResult = await pool.query(
      'SELECT user_id FROM conversations WHERE chatbot_id = $1 LIMIT 1',
      [chatbot_id]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'No conversations found for the given chatbot_id' });
    }
    
    const userId = userResult.rows[0].user_id;

    // Create a new job record
    const jobResult = await pool.query(`
      INSERT INTO conversation_update_jobs 
      (chatbot_id, user_id, total_conversations, limit_count, status)
      VALUES ($1, $2, $3, $4, 'pending')
      RETURNING id
    `, [chatbot_id, userId, totalConversations, limit || null]);

    const jobId = jobResult.rows[0].id;

    // Start processing the job in the background
    processConversationUpdateJob(jobId, chatbot_id, userId, limit, totalConversations);

    res.json({
      job_id: jobId,
      message: 'Conversation update job started',
      total_conversations: totalConversations,
      status: 'pending'
    });

  } catch (error) {
    console.error('Error starting conversation update job:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Get job status
app.get('/conversation-update-job/:jobId', authenticateToken, async (req, res) => {
  const { jobId } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM conversation_update_jobs WHERE id = $1',
      [jobId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = result.rows[0];
    
    // Calculate progress percentage if not set
    if (job.total_conversations > 0 && job.progress_percentage === 0 && job.processed_conversations > 0) {
      job.progress_percentage = Math.round((job.processed_conversations / job.total_conversations) * 100);
    }

    res.json(job);
  } catch (error) {
    console.error('Error fetching job status:', error);
    res.status(500).json({ error: 'Database error', details: error.message });
  }
});


// Background job processor
async function processConversationUpdateJob(jobId, chatbotId, userId, limit, totalConversations) {
  const client = await pool.connect();
  
  try {
    // Mark job as running
    await client.query(`
      UPDATE conversation_update_jobs 
      SET status = 'running', started_at = CURRENT_TIMESTAMP, last_updated = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [jobId]);

    console.log(`Starting background job ${jobId} for chatbot ${chatbotId} - ${totalConversations} conversations`);

    const BATCH_SIZE = 5; // Smaller batches for better reliability
    const CHUNK_SIZE = 100; // Process conversations in chunks to avoid memory issues
    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;
    let offset = 0;

    while (offset < totalConversations) {
      // Get a chunk of conversations
      let query = `
        SELECT id, conversation_data, user_id 
        FROM conversations 
        WHERE chatbot_id = $1 
        ORDER BY created_at DESC 
        LIMIT $2 OFFSET $3
      `;
      let queryParams = [chatbotId, CHUNK_SIZE, offset];
      
      if (limit && limit > 0) {
        // If there's a limit, we need to adjust our approach
        const remainingFromLimit = Math.max(0, limit - offset);
        const currentChunkSize = Math.min(CHUNK_SIZE, remainingFromLimit);
        
        if (currentChunkSize <= 0) break;
        
        query = `
          SELECT id, conversation_data, user_id FROM (
            SELECT id, conversation_data, user_id, ROW_NUMBER() OVER (ORDER BY created_at DESC) as rn
            FROM conversations
            WHERE chatbot_id = $1
          ) ranked_conversations
          WHERE rn > $2 AND rn <= $3
        `;
        queryParams = [chatbotId, offset, offset + currentChunkSize];
      }

      const conversations = await client.query(query, queryParams);
      
      if (conversations.rows.length === 0) {
        break; // No more conversations to process
      }

      console.log(`Job ${jobId}: Processing chunk ${Math.floor(offset/CHUNK_SIZE) + 1} - ${conversations.rows.length} conversations`);

      // Process this chunk in smaller batches
    const batches = [];
    for (let i = 0; i < conversations.rows.length; i += BATCH_SIZE) {
      batches.push(conversations.rows.slice(i, i + BATCH_SIZE));
    }

      for (const batch of batches) {
        // Process batch with limited concurrency
      const batchPromises = batch.map(async (conversation) => {
        try {
          const conversationText = conversation.conversation_data;
            const { emne, score, lacking_info, fallback, tags } = await getEmneAndScore(conversationText, userId, chatbotId, pool);

            await client.query(
            `UPDATE conversations
             SET emne = $1, score = $2, lacking_info = $3, fallback = $4, tags = $5
             WHERE id = $6`,
            [emne, score, lacking_info, fallback, tags, conversation.id]
          );

          return { success: true, id: conversation.id };
        } catch (error) {
            console.error(`Job ${jobId}: Error processing conversation ${conversation.id}:`, error);
          return { success: false, id: conversation.id, error: error.message };
        }
      });

      // Wait for batch to complete
        const batchResults = await Promise.all(batchPromises);
        
        // Update counters
        for (const result of batchResults) {
          if (result.success) {
            successCount++;
          } else {
            errorCount++;
          }
        }
        
        processedCount += batch.length;

        // Update job progress in database
        const progressPercentage = Math.round((processedCount / totalConversations) * 100);
        await client.query(`
          UPDATE conversation_update_jobs 
          SET processed_conversations = $1, 
              successful_conversations = $2, 
              failed_conversations = $3,
              progress_percentage = $4,
              last_updated = CURRENT_TIMESTAMP
          WHERE id = $5
        `, [processedCount, successCount, errorCount, progressPercentage, jobId]);

        console.log(`Job ${jobId}: Progress ${processedCount}/${totalConversations} (${progressPercentage}%) - Success: ${successCount}, Errors: ${errorCount}`);

        // Small delay between batches to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      offset += conversations.rows.length;

      // Check if job was cancelled (you could add a cancel endpoint)
      const jobCheck = await client.query('SELECT status FROM conversation_update_jobs WHERE id = $1', [jobId]);
      if (jobCheck.rows[0]?.status === 'cancelled') {
        console.log(`Job ${jobId} was cancelled`);
        return;
      }
    }

    // Mark job as completed
    await client.query(`
      UPDATE conversation_update_jobs 
      SET status = 'completed', 
          completed_at = CURRENT_TIMESTAMP,
          last_updated = CURRENT_TIMESTAMP,
          progress_percentage = 100
      WHERE id = $1
    `, [jobId]);

    console.log(`Job ${jobId} completed: ${processedCount} processed, ${successCount} successful, ${errorCount} failed`);

  } catch (error) {
    console.error(`Job ${jobId} failed:`, error);
    
    // Mark job as failed
    await client.query(`
      UPDATE conversation_update_jobs 
      SET status = 'failed', 
          error_message = $1,
          completed_at = CURRENT_TIMESTAMP,
          last_updated = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [error.message, jobId]);
  } finally {
    client.release();
  }
}

// removed: CRON JOB for Expiration Cleanup
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
   Consolidated Statistics Endpoint (Performance Optimized)
================================ */
app.get('/statistics-consolidated', authenticateToken, async (req, res) => {
  const { chatbot_id, start_date, end_date } = req.query;
  
  if (!chatbot_id) {
    return res.status(400).json({ error: 'chatbot_id is required' });
  }

  try {
    const chatbotIds = chatbot_id.split(',');
    
    // Build date filter
    let dateFilter = '';
    let queryParams = [chatbotIds];
    let paramIndex = 2;
    
    if (start_date && end_date) {
      dateFilter = ` AND c.created_at BETWEEN $${paramIndex++} AND $${paramIndex++}`;
      queryParams.push(start_date, end_date);
    }
    
    // Single comprehensive query to get all statistics
    const statsQuery = `
      WITH conversation_stats AS (
        SELECT 
          c.id,
          c.created_at,
          c.emne,
          c.customer_rating,
          c.fallback,
          c.ligegyldig,
          c.purchase_tracking_enabled,
          c.user_id,
          c.chatbot_id,
          EXTRACT(HOUR FROM c.created_at) as hour_of_day,
          EXTRACT(DOW FROM c.created_at) as day_of_week,
          DATE(c.created_at) as conversation_date,
          -- Pre-calculate message counts using PostgreSQL JSON functions
          COALESCE((
            SELECT COUNT(*)
            FROM jsonb_array_elements(c.conversation_data::jsonb) as msg
            WHERE (msg->>'isUser')::boolean = true
          ), 0) as user_message_count
        FROM conversations c
        WHERE c.chatbot_id = ANY($1) ${dateFilter}
      ),
      daily_aggregates AS (
        SELECT 
          conversation_date,
          SUM(user_message_count) as daily_messages,
          COUNT(*) as daily_conversations
        FROM conversation_stats
        GROUP BY conversation_date
      ),
      hourly_aggregates AS (
        SELECT 
          hour_of_day,
          SUM(user_message_count) as hourly_messages
        FROM conversation_stats
        GROUP BY hour_of_day
      ),
      topic_aggregates AS (
        SELECT 
          COALESCE(emne, 'Unknown') as topic,
          COUNT(*) as topic_count
        FROM conversation_stats
        WHERE emne IS NOT NULL
        GROUP BY emne
      )
      SELECT 
        -- Basic statistics
        (SELECT COUNT(*) FROM conversation_stats) as total_conversations,
        (SELECT SUM(user_message_count) FROM conversation_stats) as total_messages,
        
        -- Rating statistics
        (SELECT AVG(customer_rating) FROM conversation_stats WHERE customer_rating IS NOT NULL) as avg_rating,
        (SELECT COUNT(*) FROM conversation_stats WHERE customer_rating IS NOT NULL) as total_ratings,
        (SELECT COUNT(*) FROM conversation_stats WHERE customer_rating >= 4) as satisfied_ratings,
        (SELECT COUNT(*) FROM conversation_stats WHERE customer_rating = 5) as thumbs_up_count,
        (SELECT COUNT(*) FROM conversation_stats WHERE customer_rating = 1) as thumbs_down_count,
        
        -- Fallback statistics
        (SELECT COUNT(*) FROM conversation_stats WHERE fallback = true) as fallback_count,
        (SELECT COUNT(*) FROM conversation_stats WHERE fallback IS NOT NULL) as fallback_total,
        
        -- Ligegyldig statistics
        (SELECT COUNT(*) FROM conversation_stats WHERE ligegyldig = true) as ligegyldig_count,
        (SELECT COUNT(*) FROM conversation_stats WHERE ligegyldig IS NOT NULL) as ligegyldig_total,
        
        -- Daily data as JSON
        (SELECT json_object_agg(conversation_date::text, daily_messages) 
         FROM daily_aggregates) as daily_data,
        
        -- Hourly data as JSON
        (SELECT json_object_agg(hour_of_day::text, hourly_messages) 
         FROM hourly_aggregates) as hourly_data,
        
        -- Topic data as JSON
        (SELECT json_object_agg(topic, topic_count) 
         FROM topic_aggregates) as topic_data,
        
        -- Purchase tracking conversations count
        (SELECT COUNT(*) FROM conversation_stats WHERE purchase_tracking_enabled = true) as purchase_tracking_conversations
    `;

    const statsResult = await pool.query(statsQuery, queryParams);
    const stats = statsResult.rows[0];

    // Get purchase data in parallel
    const purchasePromises = chatbotIds.map(async (chatbotId) => {
      try {
        const purchaseQuery = `
          SELECT COUNT(*) as purchase_count, SUM(amount) as total_revenue
          FROM purchases 
          WHERE chatbot_id = $1 ${start_date && end_date ? 'AND created_at BETWEEN $2 AND $3' : ''}
        `;
        const purchaseParams = start_date && end_date 
          ? [chatbotId, start_date, end_date] 
          : [chatbotId];
        
        const result = await pool.query(purchaseQuery, purchaseParams);
        return {
          purchases: parseInt(result.rows[0].purchase_count) || 0,
          revenue: parseFloat(result.rows[0].total_revenue) || 0
        };
    } catch (error) {
        console.error(`Error fetching purchases for chatbot ${chatbotId}:`, error);
        return { purchases: 0, revenue: 0 };
      }
    });

    // Get greeting rate data in parallel
    const greetingRatePromise = (async () => {
      try {
        let greetingDateFilter = '';
        let greetingParams = [chatbotIds];
        let greetingParamIndex = 2;
        
        if (start_date && end_date) {
          greetingDateFilter = ` AND opened_at BETWEEN $${greetingParamIndex++} AND $${greetingParamIndex++}`;
          greetingParams.push(start_date, end_date);
        }
        
        const greetingQuery = `
          SELECT 
            (SELECT COUNT(DISTINCT user_id) FROM chatbot_opens WHERE chatbot_id = ANY($1) ${greetingDateFilter}) as total_opens,
            (SELECT COUNT(DISTINCT user_id) FROM conversations WHERE chatbot_id = ANY($1) ${dateFilter}) as total_conversations
        `;
        
        const result = await pool.query(greetingQuery, greetingParams);
        const totalOpens = parseInt(result.rows[0].total_opens) || 0;
        const totalConversations = parseInt(result.rows[0].total_conversations) || 0;
        
        return {
          totalOpens,
          greetingRate: totalOpens > 0 ? Math.round((totalConversations / totalOpens) * 100) : 0,
          hasData: totalOpens > 0
        };
      } catch (error) {
        console.error('Error fetching greeting rate:', error);
        return { totalOpens: 0, greetingRate: 0, hasData: false };
      }
    })();

    // Get leads count in parallel
    const leadsPromise = (async () => {
      try {
        const leadsQuery = `
          SELECT COUNT(*) as leads_count
          FROM conversations 
          WHERE chatbot_id = ANY($1) ${dateFilter}
          AND form_data->>'type' IN ('kontaktformular', 'kundeservice_formular')
        `;
        const result = await pool.query(leadsQuery, queryParams);
        return parseInt(result.rows[0].leads_count) || 0;
                } catch (error) {
        console.error('Error fetching leads count:', error);
        return 0;
      }
    })();

    // Wait for all parallel operations to complete
    const [purchaseResults, greetingRateData, leadsCount] = await Promise.all([
      Promise.all(purchasePromises),
      greetingRatePromise,
      leadsPromise
    ]);

    // Aggregate purchase data
    const totalPurchases = purchaseResults.reduce((sum, result) => sum + result.purchases, 0);
    const totalRevenue = purchaseResults.reduce((sum, result) => sum + result.revenue, 0);

    // Format response
    const response = {
      // Basic stats
      totalMessages: parseInt(stats.total_messages) || 0,
      totalConversations: parseInt(stats.total_conversations) || 0,
      
      // Rating stats
      totalRatings: parseInt(stats.total_ratings) || 0,
      avgRating: stats.avg_rating ? parseFloat(stats.avg_rating).toFixed(2) : 'N/A',
      satisfiedRatings: parseInt(stats.satisfied_ratings) || 0,
      thumbsUpCount: parseInt(stats.thumbs_up_count) || 0,
      thumbsDownCount: parseInt(stats.thumbs_down_count) || 0,
      
      // Fallback stats
      fallbackCount: parseInt(stats.fallback_count) || 0,
      fallbackTotal: parseInt(stats.fallback_total) || 0,
      fallbackRate: stats.fallback_total > 0 
        ? `${((stats.fallback_count / stats.fallback_total) * 100).toFixed(1)}%`
        : 'N/A',
      
      // Ligegyldig stats
      ligegyldigCount: parseInt(stats.ligegyldig_count) || 0,
      ligegyldigTotal: parseInt(stats.ligegyldig_total) || 0,
      ligegyldigRate: stats.ligegyldig_total > 0 
        ? `${((stats.ligegyldig_count / stats.ligegyldig_total) * 100).toFixed(1)}%`
        : 'N/A',
      
      // Chart data
      dailyData: stats.daily_data || {},
      hourlyData: stats.hourly_data || {},
      topicData: stats.topic_data || {},
      
      // Purchase stats
      totalPurchases,
      totalRevenue,
      averagePurchaseValue: totalPurchases > 0 ? (totalRevenue / totalPurchases).toFixed(2) : 'N/A',
      conversionRate: stats.purchase_tracking_conversations > 0 
        ? `${((totalPurchases / stats.purchase_tracking_conversations) * 100).toFixed(1)}%`
        : 'N/A',
      hasPurchaseTracking: totalPurchases > 0,
      
      // Greeting rate stats
      totalChatbotOpens: greetingRateData.totalOpens,
      greetingRate: greetingRateData.hasData ? `${greetingRateData.greetingRate}%` : 'N/A',
      hasGreetingRateData: greetingRateData.hasData,
      
      // Leads stats
      totalLeads: leadsCount,
      hasLeadsData: leadsCount > 0
    };

    res.json(response);

    } catch (error) {
    console.error('Error fetching consolidated statistics:', error);
    res.status(500).json({ error: 'Database error', details: error.message });
  }
});

/* ================================
   Tag Statistics Endpoint
================================ */
app.get('/tag-statistics', authenticateToken, async (req, res) => {
  const { chatbot_id, emne, start_date, end_date } = req.query;

  if (!chatbot_id) {
    return res.status(400).json({ error: 'chatbot_id is required' });
  }

  try {
    const chatbotIds = chatbot_id.split(',');

    let queryText = `
      SELECT tags, COUNT(*) as count
      FROM conversations
      WHERE chatbot_id = ANY($1) AND tags IS NOT NULL AND array_length(tags, 1) > 0
    `;
    let queryParams = [chatbotIds];
    let paramIndex = 2;

    if (emne && emne !== '') {
      queryText += ` AND emne = $${paramIndex++}`;
      queryParams.push(emne);
    }

    if (start_date && end_date) {
      queryText += ` AND created_at BETWEEN $${paramIndex++} AND $${paramIndex++}`;
      queryParams.push(start_date, end_date);
    }

    queryText += ` GROUP BY tags ORDER BY count DESC`;

    const result = await pool.query(queryText, queryParams);
    
    // Process the results to flatten tags and count occurrences
    const tagCounts = {};
    result.rows.forEach(row => {
      const tags = row.tags;
      const count = parseInt(row.count);
      
      if (Array.isArray(tags)) {
        tags.forEach(tag => {
          if (tag && tag.trim()) {
            const cleanTag = tag.trim();
            tagCounts[cleanTag] = (tagCounts[cleanTag] || 0) + count;
          }
        });
      }
    });

    // Convert to array format for frontend
    const tagStatistics = Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);

    res.json(tagStatistics);
  } catch (err) {
    console.error('Error retrieving tag statistics:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

/* ================================
   Text Analysis Endpoint
================================ */
app.post('/analyze-conversations', authenticateToken, async (req, res) => {
  try {
    const { chatbot_id, start_date, end_date } = req.body;
    
    if (!chatbot_id) {
      return res.status(400).json({ error: 'chatbot_id is required' });
    }
    
    // Convert comma-separated IDs into an array
    const chatbotIds = chatbot_id.split(',');
    
    // Build query to fetch conversations with scores
    let queryText = `
      SELECT id, created_at, conversation_data, score, emne, customer_rating
      FROM conversations
      WHERE chatbot_id = ANY($1) AND score IS NOT NULL
    `;
    let queryParams = [chatbotIds];
    let paramIndex = 2;
    
    // Add date filters if provided
    if (start_date && end_date) {
      queryText += ` AND created_at BETWEEN $${paramIndex++} AND $${paramIndex++}`;
      queryParams.push(start_date, end_date);
    }
    
    // Get conversations
    const result = await pool.query(queryText, queryParams);
    
    if (result.rows.length < 10) {
      return res.status(400).json({ 
        error: 'Insufficient data for analysis',
        minimumRequired: 10,
        provided: result.rows.length
      });
    }
    
    // Perform text analysis
    const analysisResults = await analyzeConversations(result.rows);
    
    res.json(analysisResults);
  } catch (error) {
    console.error('Error analyzing conversations:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
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


// Revenue Analytics endpoint (Admin only)
app.get('/revenue-analytics', authenticateToken, async (req, res) => {
  // Only full admins can access revenue analytics
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }

  try {
    console.log('Revenue analytics request started');
    
    // Fetch all users with their monthly payments and chatbot IDs
    const usersQuery = `
      SELECT 
        id,
        username,
        monthly_payment,
        chatbot_ids,
        thumbs_rating
      FROM users 
      ORDER BY monthly_payment DESC NULLS LAST
    `;
    
    console.log('Executing users query...');
    const usersResult = await pool.query(usersQuery);
    const users = usersResult.rows;
    console.log(`Found ${users.length} users`);

    // For each user, calculate their message statistics and tracking data
    const usersWithStats = await Promise.all(users.map(async (user) => {
      try {
        console.log(`Processing user: ${user.username} (ID: ${user.id})`);
        
        // Get the user's chatbot IDs
        let chatbotIds = user.chatbot_ids || [];
        if (typeof chatbotIds === 'string') {
          try {
            chatbotIds = JSON.parse(chatbotIds);
          } catch (e) {
            console.error('Error parsing chatbot_ids for user:', user.username, e);
            chatbotIds = [];
          }
        }
        
        // Get user tracking data in parallel
        const [dashboardOpensResult, pageVisitsResult] = await Promise.all([
          pool.query(`
            SELECT 
              COUNT(DISTINCT DATE(opened_at)) as total_dashboard_opens,
              COUNT(DISTINCT session_id) as unique_sessions,
              MAX(opened_at) as last_dashboard_open
            FROM user_dashboard_opens 
            WHERE user_id = $1
          `, [user.id]),
          pool.query(`
            SELECT 
              COUNT(*) as total_page_visits,
              COUNT(DISTINCT page_name) as unique_pages_visited,
              COUNT(DISTINCT DATE(visited_at)) as active_days,
              array_agg(DISTINCT page_name ORDER BY page_name) as visited_pages
            FROM user_page_visits 
            WHERE user_id = $1
          `, [user.id])
        ]);

        const trackingData = {
          total_dashboard_opens: parseInt(dashboardOpensResult.rows[0]?.total_dashboard_opens) || 0,
          unique_sessions: parseInt(dashboardOpensResult.rows[0]?.unique_sessions) || 0,
          last_dashboard_open: dashboardOpensResult.rows[0]?.last_dashboard_open || null,
          total_page_visits: parseInt(pageVisitsResult.rows[0]?.total_page_visits) || 0,
          unique_pages_visited: parseInt(pageVisitsResult.rows[0]?.unique_pages_visited) || 0,
          tracking_active_days: parseInt(pageVisitsResult.rows[0]?.active_days) || 0,
          visited_pages: pageVisitsResult.rows[0]?.visited_pages?.filter(Boolean) || []
        };
        
        if (!Array.isArray(chatbotIds) || chatbotIds.length === 0) {
          console.log(`User ${user.username} has no chatbot IDs`);
          return {
            ...user,
            total_messages: 0,
            monthly_payment: parseFloat(user.monthly_payment) || 0,
            average_monthly_messages: 0,
            last_month_messages: 0,
            average_monthly_conversations: 0,
            last_month_conversations: 0,
            csat: 'N/A',
            conversion_rate: 'N/A',
            fallback_rate: 'N/A',
            ...trackingData
          };
        }

        console.log(`User ${user.username} owns chatbots: ${chatbotIds.join(', ')}`);

        // Get all conversations for chatbots owned by this user
        const conversationsQuery = `
          SELECT 
            conversation_data,
            created_at,
            chatbot_id,
            customer_rating,
            purchase_tracking_enabled,
            fallback,
            ligegyldig,
            -- Pre-calculate message counts using PostgreSQL JSON functions
            COALESCE((
              SELECT COUNT(*)
              FROM jsonb_array_elements(conversation_data::jsonb) as msg
              WHERE (msg->>'isUser')::boolean = true
            ), 0) as user_message_count
          FROM conversations 
          WHERE chatbot_id = ANY($1)
        `;
        
        const conversationsResult = await pool.query(conversationsQuery, [chatbotIds]);
        const conversations = conversationsResult.rows;
        console.log(`Found ${conversations.length} conversations for user ${user.username}'s chatbots`);

        // Calculate total messages and conversations for this user's chatbots
        let totalMessages = 0;
        let monthlyMessages = 0;
        let lastMonthMessages = 0;
        let totalConversations = 0;
        let monthlyConversations = 0;
        let lastMonthConversations = 0;
        let totalRatingsCount = 0;
        let thumbsUpCount = 0;
        let satisfiedCount = 0;
        let fallbackCount = 0;
        let ligegyldigCount = 0;
        let conversationsWithPurchaseTracking = 0;
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        // Calculate last month (previous calendar month)
        const now = new Date();
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        
        // Calculate user's account age in days for average calculation
        const userCreatedAt = new Date(conversations.length > 0 ? 
          Math.min(...conversations.map(conv => new Date(conv.created_at).getTime())) : now);
        const daysActive = Math.max(1, Math.ceil((now - userCreatedAt) / (1000 * 60 * 60 * 24))); // Days active
        
        console.log(`User ${user.username} calculation: First conversation: ${userCreatedAt.toISOString()}, Days active: ${daysActive}`);
        
        conversations.forEach(conv => {
          // Count conversations
          totalConversations += 1;
          
          // Use pre-calculated message count from database instead of parsing JSON
          const userMessageCount = parseInt(conv.user_message_count) || 0;
          totalMessages += userMessageCount;
          
          // Count metadata-based metrics
          if (conv.purchase_tracking_enabled === true) {
            conversationsWithPurchaseTracking += 1;
          }
          if (typeof conv.customer_rating === 'number') {
            totalRatingsCount += 1;
            if (user.thumbs_rating) {
              if (conv.customer_rating === 5) thumbsUpCount += 1;
            } else if (conv.customer_rating >= 4) {
              satisfiedCount += 1;
            }
          }
          if (conv.fallback === true) {
            fallbackCount += 1;
          }
          if (conv.ligegyldig === true) {
            ligegyldigCount += 1;
          }
            
            // Count monthly messages (only from last 30 days)
            const conversationDate = new Date(conv.created_at);
            if (conversationDate >= thirtyDaysAgo) {
            monthlyMessages += userMessageCount;
              monthlyConversations += 1;
            }
            
            // Count last month messages (previous calendar month)
            if (conversationDate >= lastMonthStart && conversationDate <= lastMonthEnd) {
            lastMonthMessages += userMessageCount;
              lastMonthConversations += 1;
          }
        });

        // Calculate average monthly messages: (total messages / days active) * 30
        const averageDailyMessages = totalMessages / daysActive;
        const averageMonthlyMessages = averageDailyMessages * 30;

        // Calculate average monthly conversations: (total conversations / days active) * 30
        const averageDailyConversations = totalConversations / daysActive;
        const averageMonthlyConversations = averageDailyConversations * 30;

        // Safely parse monthly_payment
        let monthlyPayment = 0;
        if (user.monthly_payment !== null && user.monthly_payment !== undefined) {
          monthlyPayment = parseFloat(user.monthly_payment) || 0;
        }

        // Purchases count for this user's chatbots (all time)
        const purchasesCountResult = await pool.query(
          `SELECT COUNT(*)::int as cnt FROM purchases WHERE chatbot_id = ANY($1)`,
          [chatbotIds]
        );
        const purchasesCount = purchasesCountResult.rows[0]?.cnt || 0;

        // Compute per-user CSAT
        let csat = 'N/A';
        if (totalRatingsCount > 0) {
          if (user.thumbs_rating) {
            csat = `${((thumbsUpCount / totalRatingsCount) * 100).toFixed(1)}%`;
          } else {
            csat = `${((satisfiedCount / totalRatingsCount) * 100).toFixed(1)}%`;
          }
        }

        // Compute per-user conversion rate: purchases / conversations with purchase tracking
        let conversionRate = 'N/A';
        if (conversationsWithPurchaseTracking > 0) {
          conversionRate = `${((purchasesCount / conversationsWithPurchaseTracking) * 100).toFixed(1)}%`;
        }

        // Compute per-user fallback rate
        let fallbackRate = 'N/A';
        if (conversations.length > 0) {
          fallbackRate = `${((fallbackCount / conversations.length) * 100).toFixed(1)}%`;
        }

        // Compute per-user ligegyldig rate
        let ligegyldigRate = 'N/A';
        if (conversations.length > 0) {
          ligegyldigRate = `${((ligegyldigCount / conversations.length) * 100).toFixed(1)}%`;
        }

        console.log(`User ${user.username}: ${totalMessages} total msgs, ${Math.round(averageMonthlyMessages)} avg monthly msgs, purchases ${purchasesCount}, ratings ${totalRatingsCount}, csat ${csat}, convRate ${conversionRate}, fallback ${fallbackRate}, ligegyldig ${ligegyldigRate}`);

        return {
          ...user,
          total_messages: totalMessages,
          total_conversations: totalConversations,
          monthly_messages: monthlyMessages, // Last 30 days
          average_monthly_messages: Math.round(averageMonthlyMessages),
          last_month_messages: lastMonthMessages,
          monthly_conversations: monthlyConversations, // Last 30 days
          average_monthly_conversations: Math.round(averageMonthlyConversations),
          last_month_conversations: lastMonthConversations,
          days_active: daysActive,
          monthly_payment: monthlyPayment,
          csat: csat,
          conversion_rate: conversionRate,
          fallback_rate: fallbackRate,
          ligegyldig_rate: ligegyldigRate,
          ...trackingData
        };
      } catch (error) {
        console.error(`Error calculating stats for user ${user.username}:`, error);
        // Return user with default stats if there's an error
        return {
          ...user,
          total_messages: 0,
          total_conversations: 0,
          monthly_payment: parseFloat(user.monthly_payment) || 0,
          total_dashboard_opens: 0,
          unique_sessions: 0,
          last_dashboard_open: null,
          total_page_visits: 0,
          unique_pages_visited: 0,
          tracking_active_days: 0,
          visited_pages: []
        };
      }
    }));

    console.log('Finished processing all users, calculating summary...');

    // Calculate summary statistics
    const payingUsers = usersWithStats.filter(user => user.monthly_payment > 0);
    const totalRevenue = payingUsers.reduce((sum, user) => sum + user.monthly_payment, 0);
    const averagePayment = payingUsers.length > 0 ? totalRevenue / payingUsers.length : 0;

    console.log(`Summary: ${users.length} total users, ${payingUsers.length} paying users, ${totalRevenue} kr total revenue`);

    res.json({
      users: usersWithStats,
      summary: {
        total_users: users.length,
        paying_users: payingUsers.length,
        total_monthly_revenue: totalRevenue,
        average_monthly_payment: averagePayment
      }
    });

  } catch (error) {
    console.error('Error fetching revenue analytics:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Database error', details: error.message });
  }
});

// Monthly Conversation Breakdown endpoint (Admin only)
app.get('/monthly-conversation-breakdown', authenticateToken, async (req, res) => {
  // Only full admins can access this data
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }

  try {
    console.log('Monthly conversation breakdown request started');
    
    // Fetch all users with their monthly payments and chatbot IDs
    const usersQuery = `
      SELECT 
        id,
        username,
        monthly_payment,
        chatbot_ids
      FROM users 
      WHERE monthly_payment > 0
      ORDER BY monthly_payment DESC
    `;
    
    const usersResult = await pool.query(usersQuery);
    const users = usersResult.rows;
    console.log(`Found ${users.length} paying users`);

    // For each user, get monthly conversation breakdown for the last 12 months
    const usersWithMonthlyData = await Promise.all(users.map(async (user) => {
      try {
        console.log(`Processing monthly data for user: ${user.username} (ID: ${user.id})`);
        
        // Get the user's chatbot IDs
        let chatbotIds = user.chatbot_ids || [];
        if (typeof chatbotIds === 'string') {
          try {
            chatbotIds = JSON.parse(chatbotIds);
          } catch (e) {
            console.error('Error parsing chatbot_ids for user:', user.username, e);
            chatbotIds = [];
          }
        }

        if (chatbotIds.length === 0) {
          console.log(`No chatbot IDs found for user: ${user.username}`);
          return {
            ...user,
            monthly_conversations: {}
          };
        }

        // Query to get monthly conversation counts for the last 12 months
        const monthlyQuery = `
          SELECT 
            DATE_TRUNC('month', created_at) as month,
            COUNT(*) as conversation_count
          FROM conversations 
          WHERE chatbot_id = ANY($1)
            AND created_at >= NOW() - INTERVAL '12 months'
          GROUP BY DATE_TRUNC('month', created_at)
          ORDER BY month DESC
        `;

        const monthlyResult = await pool.query(monthlyQuery, [chatbotIds]);
        console.log(`Monthly query result for ${user.username}:`, monthlyResult.rows);
        
        // Convert results to a more usable format
        const monthlyConversations = {};
        monthlyResult.rows.forEach(row => {
          const date = new Date(row.month);
          const year = date.getFullYear();
          const month = date.getMonth() + 1; // JavaScript months are 0-indexed
          const monthKey = `${year}-${month.toString().padStart(2, '0')}`;
          monthlyConversations[monthKey] = parseInt(row.conversation_count);
        });

        console.log(`Found monthly data for ${user.username}:`, Object.keys(monthlyConversations).length, 'months');

        return {
          ...user,
          monthly_conversations: monthlyConversations
        };

      } catch (error) {
        console.error(`Error processing monthly data for user ${user.username}:`, error);
        return {
          ...user,
          monthly_conversations: {}
        };
      }
    }));

    console.log('Monthly conversation breakdown request completed');
    res.json({
      users: usersWithMonthlyData
    });

  } catch (error) {
    console.error('Error fetching monthly conversation breakdown:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Database error', details: error.message });
  }
});

// Get user tracking statistics (Admin only)
app.get('/user-tracking-stats', authenticateToken, async (req, res) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }

  try {
    // Get dashboard opens stats for all users
    const dashboardStats = await pool.query(`
      SELECT 
        u.id,
        u.username,
        COUNT(DISTINCT DATE(udo.opened_at)) as total_dashboard_opens,
        COUNT(DISTINCT udo.session_id) as unique_sessions,
        MAX(udo.opened_at) as last_dashboard_open
      FROM users u
      LEFT JOIN user_dashboard_opens udo ON u.id = udo.user_id
      WHERE u.monthly_payment > 0
      GROUP BY u.id, u.username
      ORDER BY total_dashboard_opens DESC
    `);

    // Get page visit stats for all users
    const pageVisitStats = await pool.query(`
      SELECT 
        u.id,
        u.username,
        COUNT(*) as total_page_visits,
        COUNT(DISTINCT upv.page_name) as unique_pages_visited,
        COUNT(DISTINCT DATE(upv.visited_at)) as active_days,
        array_agg(DISTINCT upv.page_name) as visited_pages
      FROM users u
      LEFT JOIN user_page_visits upv ON u.id = upv.user_id
      WHERE u.monthly_payment > 0
      GROUP BY u.id, u.username
      ORDER BY total_page_visits DESC
    `);

    // Get most popular pages
    const popularPages = await pool.query(`
      SELECT 
        page_name,
        COUNT(*) as visit_count,
        COUNT(DISTINCT user_id) as unique_users
      FROM user_page_visits upv
      JOIN users u ON upv.user_id = u.id
      WHERE u.monthly_payment > 0
      GROUP BY page_name
      ORDER BY visit_count DESC
    `);

    // Merge the stats
    const userStats = dashboardStats.rows.map(user => {
      const pageStats = pageVisitStats.rows.find(p => p.id === user.id) || {
        total_page_visits: 0,
        unique_pages_visited: 0,
        active_days: 0,
        visited_pages: []
      };
      
      return {
        ...user,
        ...pageStats,
        visited_pages: pageStats.visited_pages ? pageStats.visited_pages.filter(Boolean) : []
      };
    });

    res.json({
      users: userStats,
      popular_pages: popularPages.rows
    });
  } catch (error) {
    console.error('Error fetching user tracking stats:', error);
    res.status(500).json({ error: 'Database error', details: error.message });
  }
});


// removed: Shopify Credentials Management

app.get('/api/shopify/credentials/:chatbot_id', async (req, res) => {
  try {
    const { chatbot_id } = req.params;
    
    if (!chatbot_id) {
      return res.status(400).json({ error: 'Chatbot ID is required' });
    }
    
    console.log('🔑 SHOPIFY: Fetching credentials for chatbot:', chatbot_id);
    
    const result = await pool.query(
      'SELECT chatbot_id, shopify_access_token, shopify_api_key, shopify_secret_key, shopify_store, shopify_api_version FROM shopify_credentials WHERE chatbot_id = $1',
      [chatbot_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Shopify credentials not found for this chatbot' });
    }
    
    const credentials = result.rows[0];
    
    res.json({
      success: true,
      credentials: {
        shopifyStore: credentials.shopify_store,
        shopifyAccessToken: credentials.shopify_access_token,
        shopifyApiKey: credentials.shopify_api_key,
        shopifySecretKey: credentials.shopify_secret_key,
        shopifyApiVersion: credentials.shopify_api_version
      }
    });
    
  } catch (error) {
    console.error('Error fetching Shopify credentials:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/*
  POST /api/shopify/credentials
  Creates or updates Shopify credentials for a chatbot
  Body: {
    chatbot_id: string,
    shopify_store: string,
    shopify_access_token: string,
    shopify_api_key?: string,
    shopify_secret_key?: string,
    shopify_api_version?: string
  }
*/
app.post('/api/shopify/credentials', async (req, res) => {
  try {
    const {
      chatbot_id,
      shopify_store,
      shopify_access_token,
      shopify_api_key,
      shopify_secret_key,
      shopify_api_version = '2024-10'
    } = req.body;
    
    if (!chatbot_id || !shopify_store || !shopify_access_token) {
      return res.status(400).json({ 
        error: 'chatbot_id, shopify_store, and shopify_access_token are required' 
      });
    }
    
    console.log('🔑 SHOPIFY: Saving credentials for chatbot:', chatbot_id, 'store:', shopify_store);
    
    // Use UPSERT (INSERT ... ON CONFLICT ... DO UPDATE)
    const result = await pool.query(`
      INSERT INTO shopify_credentials 
      (chatbot_id, shopify_access_token, shopify_api_key, shopify_secret_key, shopify_store, shopify_api_version, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      ON CONFLICT (chatbot_id) 
      DO UPDATE SET 
        shopify_access_token = EXCLUDED.shopify_access_token,
        shopify_api_key = EXCLUDED.shopify_api_key,
        shopify_secret_key = EXCLUDED.shopify_secret_key,
        shopify_store = EXCLUDED.shopify_store,
        shopify_api_version = EXCLUDED.shopify_api_version,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, chatbot_id
    `, [chatbot_id, shopify_access_token, shopify_api_key, shopify_secret_key, shopify_store, shopify_api_version]);
    
    res.json({
      success: true,
      message: 'Shopify credentials saved successfully',
      id: result.rows[0].id
    });
    
  } catch (error) {
    console.error('Error saving Shopify credentials:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/shopify/credentials/:chatbot_id', async (req, res) => {
  try {
    const { chatbot_id } = req.params;
    
    if (!chatbot_id) {
      return res.status(400).json({ error: 'Chatbot ID is required' });
    }
    
    console.log('🔑 SHOPIFY: Deleting credentials for chatbot:', chatbot_id);
    
    const result = await pool.query(
      'DELETE FROM shopify_credentials WHERE chatbot_id = $1 RETURNING id',
      [chatbot_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Shopify credentials not found for this chatbot' });
    }
    
    res.json({
      success: true,
      message: 'Shopify credentials deleted successfully'
    });
    
  } catch (error) {
    console.error('Error deleting Shopify credentials:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});




/* ================================
   Magento Order Endpoints
================================ */

/*
  POST /api/magento/orders
  Body: {
    magentoBaseUrl: string,
    magentoConsumerKey: string,
    magentoConsumerSecret: string,
    magentoAccessToken: string,
    magentoTokenSecret: string,
    email?: string,
    phone?: string,
    order_number?: string,
    name?: string
  }
  Proxies Magento API calls to search for orders
*/
app.post('/api/magento/orders', async (req, res) => {
  try {
    const {
      magentoBaseUrl,
      magentoConsumerKey,
      magentoConsumerSecret,
      magentoAccessToken,
      magentoTokenSecret,
      email,
      phone,
      order_number,
      name,
      chatbot_id // Add chatbot_id to fetch credentials from database
    } = req.body;

    let finalMagentoBaseUrl = magentoBaseUrl;
    let finalMagentoConsumerKey = magentoConsumerKey;
    let finalMagentoConsumerSecret = magentoConsumerSecret;
    let finalMagentoAccessToken = magentoAccessToken;
    let finalMagentoTokenSecret = magentoTokenSecret;

    // If credentials not provided in request, try to fetch from database using chatbot_id
    if ((!magentoBaseUrl || !magentoConsumerKey || !magentoConsumerSecret || !magentoAccessToken || !magentoTokenSecret) && chatbot_id) {
      console.log('🔑 MAGENTO: Credentials not provided in request, fetching from database for chatbot:', chatbot_id);
      
      try {
        const credentialsResult = await pool.query(
          'SELECT magento_base_url, magento_consumer_key, magento_consumer_secret, magento_access_token, magento_token_secret FROM magento_credentials WHERE chatbot_id = $1',
          [chatbot_id]
        );
        
        if (credentialsResult.rows.length > 0) {
          const dbCredentials = credentialsResult.rows[0];
          finalMagentoBaseUrl = dbCredentials.magento_base_url;
          finalMagentoConsumerKey = dbCredentials.magento_consumer_key;
          finalMagentoConsumerSecret = dbCredentials.magento_consumer_secret;
          finalMagentoAccessToken = dbCredentials.magento_access_token;
          finalMagentoTokenSecret = dbCredentials.magento_token_secret;
          console.log('🔑 MAGENTO: Successfully fetched credentials from database for base URL:', finalMagentoBaseUrl);
        } else {
          console.log('🔑 MAGENTO: No credentials found in database for chatbot:', chatbot_id);
        }
      } catch (dbError) {
        console.error('🔑 MAGENTO: Error fetching credentials from database:', dbError);
      }
    }

    if (!finalMagentoBaseUrl || !finalMagentoConsumerKey || !finalMagentoConsumerSecret || !finalMagentoAccessToken || !finalMagentoTokenSecret) {
      return res.status(400).json({
        error: 'Magento credentials not available. Either provide all Magento credentials in request, or ensure chatbot_id has credentials configured in database.'
      });
    }

    // Build Magento API URL with proper query format using final credentials
    const apiBaseUrl = `${finalMagentoBaseUrl.replace(/\/$/, '')}/rest/V1/orders`;
    let magentoUrl = apiBaseUrl;

    if (order_number) {
      // Build URL like: /rest/V1/orders?searchCriteria[filter_groups][0][filters][0][field]=increment_id&...
      const queryParams = new URLSearchParams();
      queryParams.append('searchCriteria[filter_groups][0][filters][0][field]', 'increment_id');
      queryParams.append('searchCriteria[filter_groups][0][filters][0][value]', order_number);
      queryParams.append('searchCriteria[filter_groups][0][filters][0][condition_type]', 'eq');
      magentoUrl = `${apiBaseUrl}?${queryParams.toString()}`;
    } else if (email) {
      // Build URL for email search
    const queryParams = new URLSearchParams();
      queryParams.append('searchCriteria[filter_groups][0][filters][0][field]', 'customer_email');
      queryParams.append('searchCriteria[filter_groups][0][filters][0][value]', email);
      queryParams.append('searchCriteria[filter_groups][0][filters][0][condition_type]', 'eq');
      magentoUrl = `${apiBaseUrl}?${queryParams.toString()}`;
    }

    console.log('Making Magento API request to:', magentoUrl.replace(finalMagentoAccessToken, '[HIDDEN]'));
    console.log('🔑 MAGENTO: OAuth credentials check - Consumer Key:', finalMagentoConsumerKey?.substring(0, 10) + '...');
    console.log('🔑 MAGENTO: OAuth credentials check - Access Token:', finalMagentoAccessToken?.substring(0, 10) + '...');
    console.log('🔑 MAGENTO: Final URL being called:', magentoUrl);

    // Generate OAuth 1.0a HMAC-SHA256 signature using final credentials
    const crypto = await import('crypto');

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomBytes(16).toString('hex');

    // Parse URL to separate base URL from query parameters
    const urlObj = new URL(magentoUrl);
    const oauthBaseUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
    
    // Create parameter object for OAuth signature (including query params)
    const oauthParams = {
      oauth_consumer_key: finalMagentoConsumerKey,
      oauth_nonce: nonce,
      oauth_signature_method: 'HMAC-SHA256',
      oauth_timestamp: timestamp,
      oauth_token: finalMagentoAccessToken,
      oauth_version: '1.0'
    };

    // Add query parameters to OAuth params if they exist
    for (const [key, value] of urlObj.searchParams.entries()) {
      oauthParams[key] = value;
    }

    // Sort parameters alphabetically (OAuth 1.0a requirement)
    const sortedParams = Object.keys(oauthParams)
      .sort()
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(oauthParams[key])}`)
      .join('&');

    // Create signature base string
    const method = 'GET';
    const encodedBaseUrl = encodeURIComponent(oauthBaseUrl);
    const encodedParams = encodeURIComponent(sortedParams);
    const signatureBaseString = `${method}&${encodedBaseUrl}&${encodedParams}`;

    // Create signing key
    const signingKey = `${encodeURIComponent(magentoConsumerSecret)}&${encodeURIComponent(magentoTokenSecret)}`;

    // Generate signature
    const signature = crypto.createHmac('sha256', signingKey)
      .update(signatureBaseString)
      .digest('base64');

    // Build Authorization header
    const authHeader = `OAuth oauth_consumer_key="${encodeURIComponent(magentoConsumerKey)}",oauth_token="${encodeURIComponent(magentoAccessToken)}",oauth_signature_method="HMAC-SHA256",oauth_timestamp="${timestamp}",oauth_nonce="${encodeURIComponent(nonce)}",oauth_version="1.0",oauth_signature="${encodeURIComponent(signature)}"`;

    // Make request to Magento API
    const response = await fetch(magentoUrl, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'User-Agent': 'DialogIntelligens-Chatbot/1.0'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Magento API error:', response.status, errorText);
      return res.status(response.status).json({
        error: 'Magento API error',
        details: errorText,
        status: response.status
      });
    }

    const data = await response.json();

    // Transform Magento data to match expected format
    const transformedOrders = data.items ? data.items.map(order => {
      // Generate Magento tracking URL following the exact PHP approach
      const email = order.customer_email ? order.customer_email.toLowerCase().trim() : '';
      const hash = email ? crypto.createHash('md5').update(email).digest('hex') : '';
      const incrementId = order.increment_id;
      
      // Build tracking URL: baseUrl/track-order?o=incrementId&e=hash using final credentials
      const baseUrl = finalMagentoBaseUrl.replace(/\/$/, ''); // rtrim equivalent
      const trackingUrl = hash 
        ? `${baseUrl}/track-order?o=${incrementId}&e=${hash}`
        : null;

      console.log('🔗 MAGENTO: Generated tracking URL for order', incrementId, ':', trackingUrl);

      return {
      id: order.entity_id,
      order_number: order.increment_id,
      magentoBaseUrl: magentoBaseUrl, // Include base URL for admin link generation
      email: order.customer_email,
        trackingUrl: trackingUrl, // Add the generated tracking URL
      phone: order.billing_address?.telephone || order.customer?.telephone,
      total_price: order.grand_total,
      currency: order.base_currency_code || order.order_currency_code,
      financial_status: order.status,
      fulfillment_status: order.status === 'shipped' ? 'fulfilled' : 'unfulfilled',
      created_at: order.created_at,
      updated_at: order.updated_at,
      customer_name: `${order.customer_firstname || ''} ${order.customer_lastname || ''}`.trim(),
      tags: [],
      line_items: order.items ? order.items.map(item => ({
        id: item.item_id,
        name: item.name,
        quantity: item.qty_ordered,
        price: item.base_price,
        fulfillment_status: item.qty_shipped > 0 ? 'fulfilled' : 'unfulfilled',
        sku: item.sku
      })) : [],
      billing_address: order.billing_address ? {
        first_name: order.billing_address.firstname,
        last_name: order.billing_address.lastname,
        address1: order.billing_address.street?.[0] || '',
        address2: order.billing_address.street?.[1] || '',
        city: order.billing_address.city,
        province: order.billing_address.region,
        country: order.billing_address.country_id,
        zip: order.billing_address.postcode,
        phone: order.billing_address.telephone
      } : null,
      shipping_address: order.extension_attributes?.shipping_assignments?.[0]?.shipping?.address ? {
        first_name: order.extension_attributes.shipping_assignments[0].shipping.address.firstname,
        last_name: order.extension_attributes.shipping_assignments[0].shipping.address.lastname,
        address1: order.extension_attributes.shipping_assignments[0].shipping.address.street?.[0] || '',
        address2: order.extension_attributes.shipping_assignments[0].shipping.address.street?.[1] || '',
        city: order.extension_attributes.shipping_assignments[0].shipping.address.city,
        province: order.extension_attributes.shipping_assignments[0].shipping.address.region,
        country: order.extension_attributes.shipping_assignments[0].shipping.address.country_id,
        zip: order.extension_attributes.shipping_assignments[0].shipping.address.postcode,
        phone: order.extension_attributes.shipping_assignments[0].shipping.address.telephone
      } : null
      };
    }) : [];

    // Filter orders based on additional criteria if needed
    let filteredOrders = transformedOrders;

    if (phone && filteredOrders.length > 0) {
      console.log(`🔍 MAGENTO FILTER: Filtering ${filteredOrders.length} orders by phone: ${phone}`);
      filteredOrders = filteredOrders.filter(order => {
        const orderPhone = order.phone || order.billing_address?.phone || order.shipping_address?.phone;
        if (!orderPhone) return false;

        // Normalize phone numbers for comparison (remove all non-digits and compare last 8 digits)
        const normalizedInputPhone = String(phone).replace(/\D/g, '');
        const normalizedOrderPhone = String(orderPhone).replace(/\D/g, '');
        const inputLast8 = normalizedInputPhone.slice(-8);
        const orderLast8 = normalizedOrderPhone.slice(-8);

        const matches = inputLast8 === orderLast8 && inputLast8.length === 8;
        console.log(`${matches ? '✅' : '❌'} PHONE MATCH: Order ${order.id} - Input: "${phone}" -> "${inputLast8}", Order phone: "${orderPhone}" -> "${orderLast8}"`);
        return matches;
      });
    }

    console.log(`✅ MAGENTO: Found ${filteredOrders.length} orders matching criteria`);

    res.json({
      orders: filteredOrders,
      total_count: filteredOrders.length,
      filtered_from: transformedOrders.length
    });

  } catch (error) {
    console.error('Error fetching Magento orders:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

/*
  GET /api/magento/orders/:order_id
  Query params: magentoBaseUrl, magentoConsumerKey, magentoConsumerSecret, magentoAccessToken, magentoTokenSecret
  Gets details for a specific order
*/
app.get('/api/magento/orders/:order_id', async (req, res) => {
  try {
    const { order_id } = req.params;
    const {
      magentoBaseUrl,
      magentoConsumerKey,
      magentoConsumerSecret,
      magentoAccessToken,
      magentoTokenSecret
    } = req.query;

    if (!magentoBaseUrl || !magentoConsumerKey || !magentoConsumerSecret || !magentoAccessToken || !magentoTokenSecret) {
      return res.status(400).json({
        error: 'magentoBaseUrl, magentoConsumerKey, magentoConsumerSecret, magentoAccessToken, and magentoTokenSecret are required'
      });
    }

    // Build Magento API URL for specific order
    const magentoUrl = `${magentoBaseUrl.replace(/\/$/, '')}/rest/V1/orders/${order_id}`;

    console.log('Making Magento API request to:', magentoUrl.replace(magentoAccessToken, '[HIDDEN]'));

    // Generate OAuth 1.0a HMAC-SHA256 signature (same logic as above)
    const crypto = await import('crypto');

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomBytes(16).toString('hex');

    // Parse URL to separate base URL from query parameters
    const urlObj = new URL(magentoUrl);
    const oauthBaseUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
    
    // Create parameter object for OAuth signature (including query params)
    const oauthParams = {
      oauth_consumer_key: magentoConsumerKey,
      oauth_nonce: nonce,
      oauth_signature_method: 'HMAC-SHA256',
      oauth_timestamp: timestamp,
      oauth_token: magentoAccessToken,
      oauth_version: '1.0'
    };

    // Add query parameters to OAuth params if they exist
    for (const [key, value] of urlObj.searchParams.entries()) {
      oauthParams[key] = value;
    }

    // Sort parameters alphabetically (OAuth 1.0a requirement)
    const sortedParams = Object.keys(oauthParams)
      .sort()
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(oauthParams[key])}`)
      .join('&');

    // Create signature base string
    const method = 'GET';
    const encodedBaseUrl = encodeURIComponent(oauthBaseUrl);
    const encodedParams = encodeURIComponent(sortedParams);
    const signatureBaseString = `${method}&${encodedBaseUrl}&${encodedParams}`;

    // Create signing key
    const signingKey = `${encodeURIComponent(magentoConsumerSecret)}&${encodeURIComponent(magentoTokenSecret)}`;

    // Generate signature
    const signature = crypto.createHmac('sha256', signingKey)
      .update(signatureBaseString)
      .digest('base64');

    // Build Authorization header
    const authHeader = `OAuth oauth_consumer_key="${encodeURIComponent(magentoConsumerKey)}",oauth_token="${encodeURIComponent(magentoAccessToken)}",oauth_signature_method="HMAC-SHA256",oauth_timestamp="${timestamp}",oauth_nonce="${encodeURIComponent(nonce)}",oauth_version="1.0",oauth_signature="${encodeURIComponent(signature)}"`;

    // Make request to Magento API
    const response = await fetch(magentoUrl, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'User-Agent': 'DialogIntelligens-Chatbot/1.0'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Magento API error:', response.status, errorText);
      return res.status(response.status).json({
        error: 'Magento API error',
        details: errorText,
        status: response.status
      });
    }

    const order = await response.json();

    // Transform single order data
    // Generate Magento tracking URL following the exact PHP approach
    const email = order.customer_email ? order.customer_email.toLowerCase().trim() : '';
    const hash = email ? crypto.createHash('md5').update(email).digest('hex') : '';
    const incrementId = order.increment_id;
    
    // Build tracking URL: baseUrl/track-order?o=incrementId&e=hash
    const baseUrl = magentoBaseUrl.replace(/\/$/, ''); // rtrim equivalent
    const trackingUrl = hash 
      ? `${baseUrl}/track-order?o=${incrementId}&e=${hash}`
      : null;

    console.log('🔗 MAGENTO: Generated tracking URL for single order', incrementId, ':', trackingUrl);

    const transformedOrder = {
      id: order.entity_id,
      order_number: order.increment_id,
      magentoBaseUrl: magentoBaseUrl, // Include base URL for admin link generation
      email: order.customer_email,
      trackingUrl: trackingUrl, // Add the generated tracking URL
      phone: order.billing_address?.telephone || order.customer?.telephone,
      total_price: order.grand_total,
      currency: order.base_currency_code || order.order_currency_code,
      financial_status: order.status,
      fulfillment_status: order.status === 'shipped' ? 'fulfilled' : 'unfulfilled',
      created_at: order.created_at,
      updated_at: order.updated_at,
      customer_name: `${order.customer_firstname || ''} ${order.customer_lastname || ''}`.trim(),
      tags: [],
      line_items: order.items ? order.items.map(item => ({
        id: item.item_id,
        name: item.name,
        quantity: item.qty_ordered,
        price: item.base_price,
        fulfillment_status: item.qty_shipped > 0 ? 'fulfilled' : 'unfulfilled',
        sku: item.sku
      })) : [],
      billing_address: order.billing_address ? {
        first_name: order.billing_address.firstname,
        last_name: order.billing_address.lastname,
        address1: order.billing_address.street?.[0] || '',
        address2: order.billing_address.street?.[1] || '',
        city: order.billing_address.city,
        province: order.billing_address.region,
        country: order.billing_address.country_id,
        zip: order.billing_address.postcode,
        phone: order.billing_address.telephone
      } : null,
      shipping_address: order.extension_attributes?.shipping_assignments?.[0]?.shipping?.address ? {
        first_name: order.extension_attributes.shipping_assignments[0].shipping.address.firstname,
        last_name: order.extension_attributes.shipping_assignments[0].shipping.address.lastname,
        address1: order.extension_attributes.shipping_assignments[0].shipping.address.street?.[0] || '',
        address2: order.extension_attributes.shipping_assignments[0].shipping.address.street?.[1] || '',
        city: order.extension_attributes.shipping_assignments[0].shipping.address.city,
        province: order.extension_attributes.shipping_assignments[0].shipping.address.region,
        country: order.extension_attributes.shipping_assignments[0].shipping.address.country_id,
        zip: order.extension_attributes.shipping_assignments[0].shipping.address.postcode,
        phone: order.extension_attributes.shipping_assignments[0].shipping.address.telephone
      } : null
    };

    res.json(transformedOrder);

  } catch (error) {
    console.error('Error fetching Magento order:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
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

/* ================================
   Purchases (Chatbot conversion tracking)
================================ */

// moved to purchasesRoutes

// After Express app is initialised and authenticateToken is declared but before app.listen
registerPromptTemplateV2Routes(app, pool, authenticateToken);
registerPopupMessageRoutes(app, pool, authenticateToken);
registerSplitTestRoutes(app, pool, authenticateToken);
registerReportRoutes(app, authenticateToken);
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

// Initialize GDPR table and routes
ensureGdprSettingsTable(pool).catch(err => console.error('GDPR init error:', err));
registerGdprRoutes(app, pool, authenticateToken);
// Optional scheduler (kept equivalent behavior)
scheduleGdprCleanup(pool, runGdprCleanupAllService);
registerShopifyRoutes(app, pool);
setShopifyCredentialsPool(pool);
registerShopifyCredentialsRoutes(app);
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

/* ================================
   Error Logging Endpoints
================================ */

// Helper function to categorize errors automatically
function categorizeError(errorMessage, errorDetails) {
  const message = errorMessage.toLowerCase();
  
  if (message.includes('freshdesk') || message.includes('ticket creation') || message.includes('freshdesk ticket')) {
    return 'FRESHDESK_ERROR';
  } else if (message.includes('api') || message.includes('fetch') || message.includes('request')) {
    return 'API_ERROR';
  } else if (message.includes('database') || message.includes('sql') || message.includes('query')) {
    return 'DATABASE_ERROR';
  } else if (message.includes('auth') || message.includes('token') || message.includes('unauthorized')) {
    return 'AUTHENTICATION_ERROR';
  } else if (message.includes('validation') || message.includes('invalid') || message.includes('required')) {
    return 'VALIDATION_ERROR';
  } else if (message.includes('network') || message.includes('connection') || message.includes('timeout')) {
    return 'NETWORK_ERROR';
  } else if (message.includes('parsing') || message.includes('json') || message.includes('syntax')) {
    return 'PARSING_ERROR';
  } else if (message.includes('openai') || message.includes('embedding') || message.includes('gpt')) {
    return 'AI_SERVICE_ERROR';
  } else if (message.includes('pinecone') || message.includes('vector')) {
    return 'VECTOR_DATABASE_ERROR';
  } else {
    return 'UNKNOWN_ERROR';
  }
}

// POST /api/log-error - Log an error from the chatbot
app.post('/api/log-error', async (req, res) => {
  try {
    const { 
      chatbot_id, 
      user_id, 
      error_message, 
      error_details, 
      stack_trace,
      error_category: providedCategory
    } = req.body;

    if (!chatbot_id || !error_message) {
      return res.status(400).json({ error: 'chatbot_id and error_message are required' });
    }

    // Use provided category if valid, otherwise automatically categorize the error
    const validCategories = [
      'API_ERROR', 'DATABASE_ERROR', 'AUTHENTICATION_ERROR', 'VALIDATION_ERROR',
      'NETWORK_ERROR', 'PARSING_ERROR', 'AI_SERVICE_ERROR', 'VECTOR_DATABASE_ERROR',
      'FRESHDESK_ERROR', 'UNKNOWN_ERROR'
    ];
    
    const error_category = validCategories.includes(providedCategory) 
      ? providedCategory 
      : categorizeError(error_message, error_details);

    // Insert error log
    const result = await pool.query(
      `INSERT INTO error_logs (chatbot_id, user_id, error_category, error_message, error_details, stack_trace)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        chatbot_id,
        user_id || null,
        error_category,
        error_message,
        error_details ? JSON.stringify(error_details) : null,
        stack_trace || null
      ]
    );

    console.log(`Error logged for chatbot ${chatbot_id}: ${error_category} - ${error_message}`);
    
    res.status(201).json({
      message: 'Error logged successfully',
      error_log: result.rows[0]
    });
  } catch (err) {
    console.error('Error logging error to database:', err);
    res.status(500).json({ error: 'Failed to log error', details: err.message });
  }
});


// Add this function after the existing helper functions
async function saveContextChunks(conversationId, messageIndex, chunks) {
  if (!chunks || chunks.length === 0) return;
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Clear existing chunks for this message (in case of retry)
    await client.query(
      'DELETE FROM message_context_chunks WHERE conversation_id = $1 AND message_index = $2',
      [conversationId, messageIndex]
    );
    
    // Insert new chunks
    for (const chunk of chunks) {
      await client.query(
        `INSERT INTO message_context_chunks 
         (conversation_id, message_index, chunk_content, chunk_metadata, similarity_score)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          conversationId,
          messageIndex,
          chunk.pageContent || chunk.content || '',
          JSON.stringify(chunk.metadata || {}),
          chunk.score || null
        ]
      );
    }
    
    await client.query('COMMIT');
    console.log(`Saved ${chunks.length} context chunks for conversation ${conversationId}, message ${messageIndex}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving context chunks:', error);
  } finally {
    client.release();
  }
}

// Add this function to retrieve context chunks
async function getContextChunks(conversationId, messageIndex) {
  try {
    const result = await pool.query(
      `SELECT chunk_content, chunk_metadata, similarity_score 
       FROM message_context_chunks 
       WHERE conversation_id = $1 AND message_index = $2 
       ORDER BY similarity_score DESC NULLS LAST`,
      [conversationId, messageIndex]
    );
    return result.rows;
  } catch (error) {
    console.error('Error retrieving context chunks:', error);
    return [];
  }
}

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

// Add this endpoint to update a user's Pinecone API key
app.put('/user-pinecone-api-key/:id', authenticateToken, async (req, res) => {
  const targetId = parseInt(req.params.id);
  if (!(req.user.isAdmin || (req.user.isLimitedAdmin && (req.user.accessibleUserIds || []).includes(targetId)))) {
    return res.status(403).json({ error: 'Forbidden: You do not have permission to modify this user\'s Pinecone API key' });
  }

  const { pinecone_api_key } = req.body;
  
  // Validate input
  if (!pinecone_api_key || typeof pinecone_api_key !== 'string' || pinecone_api_key.trim() === '') {
    return res.status(400).json({ 
      error: 'pinecone_api_key is required and must be a non-empty string'
    });
  }
  
  try {
    // First check if the user exists
    const checkResult = await pool.query('SELECT * FROM users WHERE id = $1', [targetId]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update the user's Pinecone API key and last_modified timestamp
    const result = await pool.query(
      'UPDATE users SET pinecone_api_key = $1, last_modified = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, username',
      [pinecone_api_key.trim(), targetId]
    );
    
    res.status(200).json({ 
      message: 'Pinecone API key updated successfully',
      user: {
        id: result.rows[0].id,
        username: result.rows[0].username
      } 
    });
  } catch (error) {
    console.error('Error updating Pinecone API key:', error);
    res.status(500).json({ error: 'Database error', details: error.message });
  }
});

// Add this endpoint to update a user's Pinecone indexes
app.put('/user-indexes/:id', authenticateToken, async (req, res) => {
  const targetId = parseInt(req.params.id);
  if (!(req.user.isAdmin || (req.user.isLimitedAdmin && (req.user.accessibleUserIds || []).includes(targetId)))) {
    return res.status(403).json({ error: 'Forbidden: You do not have permission to modify this user\'s Pinecone indexes' });
  }
  const { pinecone_indexes } = req.body;
  
  // Validate input
  if (!Array.isArray(pinecone_indexes)) {
    return res.status(400).json({ 
      error: 'pinecone_indexes must be an array'
    });
  }
  
  // Validate structure of each index object
  for (const index of pinecone_indexes) {
    if (!index.namespace || !index.index_name) {
      return res.status(400).json({
        error: 'Each index must have namespace and index_name properties'
      });
    }
    // API_key is optional, so no validation needed for it
  }
  
  try {
    // First check if the user exists
    const checkResult = await pool.query('SELECT * FROM users WHERE id = $1', [targetId]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Convert the array to JSON string
    const indexesJson = JSON.stringify(pinecone_indexes);
    
    // Update the user's indexes and last_modified timestamp
    const result = await pool.query(
      'UPDATE users SET pinecone_indexes = $1, last_modified = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, username',
      [indexesJson, targetId]
    );
    
    res.status(200).json({ 
      message: 'Pinecone indexes updated successfully',
      user: {
        id: result.rows[0].id,
        username: result.rows[0].username
      } 
    });
  } catch (error) {
    console.error('Error updating user indexes:', error);
    res.status(500).json({ error: 'Database error', details: error.message });
  }
});

// GET total count of unread comments
app.get('/unread-comments-count', authenticateToken, async (req, res) => {
  const { chatbot_id } = req.query;
  
  if (!chatbot_id) {
    return res.status(400).json({ error: 'chatbot_id is required' });
  }

  try {
    const chatbotIds = chatbot_id.split(',');
    const userId = req.user.userId;

    // Count distinct conversations that have unread comments for this user
    // Only for conversations belonging to the user's chatbots
    const queryText = `
      SELECT COUNT(DISTINCT c.id) AS unread_conversations_count
      FROM conversations c
      WHERE c.chatbot_id = ANY($1)
      AND EXISTS (
        SELECT 1 FROM conversation_comments cc
        WHERE cc.conversation_id = c.id
        AND NOT EXISTS (
          SELECT 1 FROM conversation_comment_views ccv
          WHERE ccv.comment_id = cc.id AND ccv.user_id = $2
        )
      )
    `;
    
    const result = await pool.query(queryText, [chatbotIds, userId]);
    const unreadConversationsCount = parseInt(result.rows[0]?.unread_conversations_count || 0);
    
    res.json({ unread_comments_count: unreadConversationsCount });
  } catch (err) {
    console.error('Error fetching unread conversations count:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// GET total count of leads (contact form submissions)
app.get('/leads-count', authenticateToken, async (req, res) => {
  const { chatbot_id } = req.query;
  
  if (!chatbot_id) {
    return res.status(400).json({ error: 'chatbot_id is required' });
  }

  try {
    const chatbotIds = chatbot_id.split(',');

    // Count conversations that have form submissions (leads)
    const queryText = `
      SELECT COUNT(DISTINCT c.id) AS leads_count
      FROM conversations c
      WHERE c.chatbot_id = ANY($1)
      AND c.form_data->>'type' IN ('kontaktformular', 'kundeservice_formular')
    `;
    
    const result = await pool.query(queryText, [chatbotIds]);
    const leadsCount = parseInt(result.rows[0]?.leads_count || 0);
    
    res.json({ leads_count: leadsCount });
  } catch (err) {
    console.error('Error fetching leads count:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// GET total count of unread livechat messages
app.get('/unread-livechat-count', authenticateToken, async (req, res) => {
  const { chatbot_id } = req.query;
  
  if (!chatbot_id) {
    return res.status(400).json({ error: 'chatbot_id is required' });
  }

  try {
    const chatbotIds = chatbot_id.split(',');
    const userId = req.user.userId;

    // Count livechat conversations that are unread (viewed = false) for this user's chatbots
    const queryText = `
      SELECT COUNT(c.id) AS unread_livechat_count
      FROM conversations c
      WHERE c.chatbot_id = ANY($1)
      AND c.is_livechat = TRUE
      AND (c.viewed = FALSE OR c.viewed IS NULL)
    `;
    
    const result = await pool.query(queryText, [chatbotIds]);
    const unreadLivechatCount = parseInt(result.rows[0]?.unread_livechat_count || 0);
    
    res.json({ unread_livechat_count: unreadLivechatCount });
  } catch (err) {
    console.error('Error fetching unread livechat count:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

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
