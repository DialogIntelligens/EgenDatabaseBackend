import { Pinecone } from '@pinecone-database/pinecone';
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import OpenAI from 'openai';
import cron from 'node-cron'; // For scheduled clean-ups
import { generateStatisticsReport } from './reportGenerator.js'; // Import report generator
import { analyzeConversations } from './textAnalysis.js'; // Import text analysis
import { generateGPTAnalysis } from './gptAnalysis.js'; // Import GPT analysis
import { registerPromptTemplateV2Routes } from './promptTemplateV2Routes.js';
import { createFreshdeskTicket } from './freshdeskHandler.js';

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
    console.log('Authenticated user:', user);
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
   Bodylab Order API Proxy
================================ */
app.post('/api/proxy/order', async (req, res) => {
  try {
    // Log the request for debugging
    console.log("Bodylab API request:", JSON.stringify(req.body, null, 2));
    
    // Forward the request to Bodylab API
    const response = await fetch("https://www.bodylab.dk/api/order.asp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(req.body),
    });

    // First get response as text for debugging
    const responseText = await response.text();
    console.log("Bodylab API raw response:", responseText);
    
    // Check if the response is ok
    if (!response.ok) {
      console.error("Bodylab API error response:", responseText);
      return res.status(response.status).json({
        status: "error",
        message: `Failed to fetch order details. ${response.status} ${response.statusText}`,
        details: responseText
      });
    }
    
    // Attempt to fix common JSON issues
    let cleanedText = responseText
      // Fix line breaks in strings that might break JSON
      .replace(/[\r\n]+/g, ' ')
      // Fix trailing commas
      .replace(/,\s*}/g, '}')
      .replace(/,\s*\]/g, ']')
      // Remove control characters
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
      
    // Special fix for Bodylab API: check if we have a valid JSON structure
    if (!cleanedText.trim().startsWith('{') && !cleanedText.trim().startsWith('[')) {
      console.log("Response doesn't start with { or [ - attempting to fix");
      cleanedText = `{"status":"success", "orders":${cleanedText}}`;
    }
    
    // Ensure proper JSON structure with closing brackets
    let braceCount = 0;
    let bracketCount = 0;
    
    for (const char of cleanedText) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
      if (char === '[') bracketCount++;
      if (char === ']') bracketCount--;
    }
    
    // Add missing closing brackets
    if (braceCount > 0) {
      console.log(`Missing ${braceCount} closing braces - adding them`);
      cleanedText += '}'.repeat(braceCount);
    }
    
    if (bracketCount > 0) {
      console.log(`Missing ${bracketCount} closing brackets - adding them`);
      cleanedText += ']'.repeat(bracketCount);
    }
    
    try {
      // Try to parse the cleaned JSON
      const data = JSON.parse(cleanedText);
      
      // Handle different response formats
      if (data) {
        // Case 1: Multiple orders as an array outside the orders property
        if (Array.isArray(data) && data.length > 0 && data[0].order_number) {
          return res.json({
            status: "success",
            orders: data
          });
        }
        // Case 2: Single order without wrapper
        else if (data.order_number && !data.orders) {
          return res.json({
            status: "success",
            orders: [data]
          });
        }
        // Case 3: Already well-structured response
        else {
          // Ensure orders is an array if present
          if (data.orders && !Array.isArray(data.orders)) {
            data.orders = [data.orders];
          }
          return res.json(data);
        }
      }
    } catch (jsonError) {
      console.error("Error parsing JSON response:", jsonError);
      console.log("Failed to parse JSON:", cleanedText);
      
      // Try to extract orders using regex as a fallback
      try {
        // Pull out order details using regex
        const orderNumberMatches = [...cleanedText.matchAll(/"order_number"\s*:\s*"([^"]+)"/g)];
        const orderStatusMatches = [...cleanedText.matchAll(/"order_status"\s*:\s*"([^"]+)"/g)];
        const trackingNumberMatches = [...cleanedText.matchAll(/"trackingNumber"\s*:\s*"([^"]+)"/g)];
        const trackingDateMatches = [...cleanedText.matchAll(/"trackingDate"\s*:\s*"([^"]+)"/g)];
        const attentionMatches = [...cleanedText.matchAll(/"attention"\s*:\s*"([^"]+)"/g)];
        
        // If we found order numbers, we can return a basic response
        if (orderNumberMatches.length > 0) {
          const orders = orderNumberMatches.map((match, index) => ({
            order_number: match[1],
            order_status: orderStatusMatches[index] ? orderStatusMatches[index][1] : "Unknown",
            trackingNumber: trackingNumberMatches[index] ? trackingNumberMatches[index][1] : "",
            trackingDate: trackingDateMatches[index] ? trackingDateMatches[index][1] : "",
            attention: attentionMatches[index] ? attentionMatches[index][1] : ""
          }));
          
          console.log(`Successfully extracted ${orders.length} orders with regex fallback`);
          return res.json({
            status: "success",
            orders: orders
          });
        }
      } catch (regexError) {
        console.error("Error in regex extraction:", regexError);
      }
      
      // Create mock data with the original request details as fallback
      const mockData = {
        status: "success",
        orders: [{
          order_number: req.body.order_number || "Unknown",
          order_status: "Unknown",
          trackingNumber: "",
          trackingDate: "",
          attention: "Der opstod en teknisk fejl ved hentning af dine ordredetaljer."
        }]
      };
      
      console.log("Returning fallback response:", mockData);
      return res.json(mockData);
    }
  } catch (error) {
    console.error("Error proxying request:", error);
    return res.status(500).json({
      status: "success", // Still return success to avoid frontend errors
      message: "Could not retrieve order information. The system might be temporarily unavailable.",
      orders: [{
        order_number: req.body.order_number || "Unknown",
        order_status: "Error",
        trackingNumber: "",
        trackingDate: "",
        attention: "Der opstod en teknisk fejl. Prøv igen senere eller kontakt kundeservice."
      }]
    });
  }
});

/* ================================
   BevCo Order API Proxy
================================ */
app.post('/api/proxy/bevco-order', async (req, res) => {
  try {
    // Log the request for debugging
    console.log("BevCo API request:", JSON.stringify(req.body, null, 2));
    
    // Forward the request to BevCo API
    const response = await fetch("https://api.bevco.dk/store-api/dialog-intelligens/order/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "sw-api-key": "9533ee33bf82412f94dd8936ce59b908",
        "sw-access-key": "SWSCX1MTFXXC4BHA0UDNEHYBFQ"
      },
      body: JSON.stringify(req.body),
    });

    // First get response as text for debugging
    const responseText = await response.text();
    console.log("BevCo API raw response:", responseText);
    
    // Check if the response is ok
    if (!response.ok) {
      console.error("BevCo API error response:", responseText);
      return res.status(response.status).json({
        status: "error",
        message: `Failed to fetch order details. ${response.status} ${response.statusText}`,
        details: responseText
      });
    }
    
    try {
      // Try to parse the JSON
      const data = responseText ? JSON.parse(responseText) : {};
      
      // Ensure we have a standardized response format
      const standardizedResponse = {
        status: "success",
        orders: []
      };
      
      // If we have order data, format it appropriately
      if (data) {
        if (Array.isArray(data)) {
          standardizedResponse.orders = data;
        } else if (data.orders && Array.isArray(data.orders)) {
          standardizedResponse.orders = data.orders;
        } else if (Object.keys(data).length > 0) {
          // Treat as a single order
          standardizedResponse.orders = [data];
        }
      }
      
      return res.json(standardizedResponse);
    } catch (jsonError) {
      console.error("Error parsing BevCo JSON response:", jsonError);
      console.log("Failed to parse JSON:", responseText);
      
      // Return a default response for invalid JSON
      return res.json({
        status: "success",
        orders: [{
          order_number: req.body.order_number || "Unknown",
          order_status: "Error",
          attention: "Der kunne ikke hentes ordredetaljer. Formatet af svaret var uventet."
        }]
      });
    }
  } catch (error) {
    console.error("Error proxying request to BevCo:", error);
    return res.status(500).json({
      status: "success", // Still return success to avoid frontend errors
      message: "Could not retrieve order information. The system might be temporarily unavailable.",
      orders: [{
        order_number: req.body.order_number || "Unknown",
        order_status: "Error",
        attention: "Der opstod en teknisk fejl. Prøv igen senere eller kontakt kundeservice."
      }]
    });
  }
});

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

      // Upsert into Pinecone
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

/* ================================
   Registration & Login
================================ */
app.post('/register', async (req, res) => {
  const {
    username,
    password,
    chatbot_ids,
    pinecone_api_key,
    pinecone_indexes,
    chatbot_filepath,
    is_admin,
    is_limited_admin,
    accessible_chatbot_ids,
    accessible_user_ids
  } = req.body;

  // Basic validation: Ensure chatbot_filepath is an array if provided
  if (chatbot_filepath && !Array.isArray(chatbot_filepath)) {
    return res.status(400).json({ error: 'chatbot_filepath must be an array of strings.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    // Convert chatbot_ids to a JSON array or similar
    const chatbotIdsArray = chatbot_ids;

    const pineconeIndexesJSON = JSON.stringify(pinecone_indexes);

    const result = await pool.query(
      `INSERT INTO users (
         username,
         password,
         chatbot_ids,
         pinecone_api_key,
         pinecone_indexes,
         chatbot_filepath,
         is_admin,
         is_limited_admin,
         accessible_chatbot_ids,
         accessible_user_ids
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,

      [
         username,
        hashedPassword,
        chatbotIdsArray,
        pinecone_api_key,
        pineconeIndexesJSON,
        chatbot_filepath || [],
        is_admin,
        is_limited_admin,
        accessible_chatbot_ids || [],
        accessible_user_ids || []
      ]
    );

    return res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    console.error('Error registering user:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});


app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT *, agent_name, profile_picture FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    // Sign the JWT, including limited admin details
    const tokenPayload = {
      userId: user.id,
      isAdmin: user.is_admin,
      isLimitedAdmin: user.is_limited_admin,
      accessibleChatbotIds: user.accessible_chatbot_ids || [],
      accessibleUserIds: user.accessible_user_ids || []
    };
    const token = jwt.sign(tokenPayload, SECRET_KEY, { expiresIn: '24h' });

    // Determine chatbot access list based on role
    let chatbotIds = user.chatbot_ids || [];
    if (typeof chatbotIds === 'string') {
      chatbotIds = JSON.parse(chatbotIds);
    }

    if (user.is_admin) {
      const allUsers = await pool.query('SELECT chatbot_ids FROM users');
      let mergedIds = [];
      for (const row of allUsers.rows) {
        let ids = row.chatbot_ids || [];
        if (typeof ids === 'string') {
          ids = JSON.parse(ids);
        }
        mergedIds = mergedIds.concat(ids);
      }
      const uniqueIds = [...new Set(mergedIds)];
      chatbotIds = uniqueIds;
    } else if (user.is_limited_admin) {
      // Limited admin: use the accessible_chatbot_ids list
      chatbotIds = user.accessible_chatbot_ids || [];
    }

    return res.json({
      token,
      chatbot_ids: chatbotIds,
      chatbot_filepath: user.chatbot_filepath || [],
      is_admin: user.is_admin,
      is_limited_admin: user.is_limited_admin,
      accessible_chatbot_ids: user.accessible_chatbot_ids || [],
      accessible_user_ids: user.accessible_user_ids || [],
      thumbs_rating: user.thumbs_rating || false,
      company_info: user.company_info || '',
      livechat: user.livechat || false,
      agent_name: user.agent_name || 'Support Agent',
      profile_picture: user.profile_picture || ''
    });
  } catch (err) {
    console.error('Error logging in:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});


app.delete('/conversations/:id', authenticateToken, async (req, res) => {
  // Only admins can delete single conversations
  if (!(req.user.isAdmin || req.user.isLimitedAdmin)) {
    return res.status(403).json({ error: 'Forbidden: Admins only' });
  }

  const { id } = req.params;

  try {
    // We do a standard single-row DELETE by conversation ID
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

/* ================================
   Comment Endpoints
================================ */
// GET comments for a conversation
app.get('/conversations/:id/comments', authenticateToken, async (req, res) => {
  const conversationId = req.params.id;

  try {
    const result = await pool.query(
      'SELECT * FROM conversation_comments WHERE conversation_id = $1 ORDER BY created_at ASC',
      [conversationId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching comments:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// POST new comment
app.post('/conversations/:id/comments', authenticateToken, async (req, res) => {
  const conversationId = req.params.id;
  const { username, comment_text } = req.body;

  if (!username || !comment_text) {
    return res.status(400).json({ error: 'Username and comment_text are required' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO conversation_comments (conversation_id, username, comment_text) VALUES ($1, $2, $3) RETURNING *',
      [conversationId, username, comment_text]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating comment:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// PUT update comment
app.put('/conversations/:id/comments/:commentId', authenticateToken, async (req, res) => {
  const { commentId } = req.params;
  const { username, comment_text } = req.body;

  if (!username || !comment_text) {
    return res.status(400).json({ error: 'Username and comment_text are required' });
  }

  try {
    const result = await pool.query(
      'UPDATE conversation_comments SET username = $1, comment_text = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
      [username, comment_text, commentId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating comment:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// DELETE comment
app.delete('/conversations/:id/comments/:commentId', authenticateToken, async (req, res) => {
  const { commentId } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM conversation_comments WHERE id = $1 RETURNING *',
      [commentId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    
    res.json({ message: 'Comment deleted successfully', deleted: result.rows[0] });
  } catch (err) {
    console.error('Error deleting comment:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// POST mark comments as viewed for a conversation
app.post('/conversations/:id/comments/mark-viewed', authenticateToken, async (req, res) => {
  const conversationId = req.params.id;
  const userId = req.user.userId;

  try {
    // Get all comments for this conversation
    const comments = await pool.query(
      'SELECT id FROM conversation_comments WHERE conversation_id = $1',
      [conversationId]
    );

    if (comments.rows.length === 0) {
      return res.json({ message: 'No comments to mark as viewed' });
    }

    // Mark all comments as viewed by this user
    const commentIds = comments.rows.map(comment => comment.id);
    
    // Use INSERT ... ON CONFLICT to avoid duplicates
    for (const commentId of commentIds) {
      await pool.query(
        `INSERT INTO conversation_comment_views (user_id, comment_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, comment_id) DO NOTHING`,
        [userId, commentId]
      );
    }

    res.json({ message: 'Comments marked as viewed', count: commentIds.length });
  } catch (err) {
    console.error('Error marking comments as viewed:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// POST mark comments as unread for a conversation
app.post('/conversations/:id/comments/mark-unread', authenticateToken, async (req, res) => {
  const conversationId = req.params.id;
  const userId = req.user.userId;

  try {
    // Get all comments for this conversation
    const comments = await pool.query(
      'SELECT id FROM conversation_comments WHERE conversation_id = $1',
      [conversationId]
    );

    if (comments.rows.length === 0) {
      return res.json({ message: 'No comments to mark as unread' });
    }

    // Remove all view records for this user and conversation's comments
    const commentIds = comments.rows.map(comment => comment.id);
    
    await pool.query(
      'DELETE FROM conversation_comment_views WHERE user_id = $1 AND comment_id = ANY($2)',
      [userId, commentIds]
    );

    res.json({ message: 'Comments marked as unread', count: commentIds.length });
  } catch (err) {
    console.error('Error marking comments as unread:', err);
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
      fallback = null
    ) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

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
               created_at = NOW()
           WHERE user_id = $1 AND chatbot_id = $2
           RETURNING *`,
          [user_id, chatbot_id, conversation_data, emne, score, customer_rating, lacking_info, bug_status, purchase_tracking_enabled, is_livechat, fallback]
        );

        if (updateResult.rows.length === 0) {
          const insertResult = await client.query(
            `INSERT INTO conversations
             (user_id, chatbot_id, conversation_data, emne, score, customer_rating, lacking_info, bug_status, purchase_tracking_enabled, is_livechat, fallback)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING *`,
            [user_id, chatbot_id, conversation_data, emne, score, customer_rating, lacking_info, bug_status, purchase_tracking_enabled, is_livechat, fallback]
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
    fallback
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

    // Call upsertConversation with is_livechat and fallback parameters
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
      is_livechat || false,
      fallback
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
      SELECT *
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
  const { chatbot_id, fejlstatus, customer_rating, emne } = req.query;
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
      } else {
        queryText += ` AND c.bug_status = $${paramIndex++}`;
        queryParams.push(fejlstatus);
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
  const { chatbot_id, page_number, page_size, lacking_info, start_date, end_date, conversation_filter, fejlstatus, customer_rating, emne } = req.query;

  if (!chatbot_id) {
    return res.status(400).json({ error: 'chatbot_id is required' });
  }

  try {
    const chatbotIds = chatbot_id.split(',');
    const userId = req.user.userId;

    let queryText = `
      SELECT c.id, c.created_at, c.emne, c.customer_rating, c.bug_status, c.conversation_data, c.viewed,
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
             END as has_unread_comments
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
      } else {
        queryText += ` AND c.bug_status = $${paramIndex++}`;
        queryParams.push(fejlstatus);
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

    queryText += ` GROUP BY c.id `;
    queryText += ` ORDER BY c.created_at DESC `;
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
    
    // Only mark the conversation as viewed if the user is not an admin
    if (!req.user.isAdmin) {
      await pool.query('UPDATE conversations SET viewed = TRUE WHERE id = $1', [id]);
    }
    
    res.json(result.rows[0]);
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

/* ================================
   update-conversations Endpoint
================================ */
app.post('/update-conversations', async (req, res) => {
  const { chatbot_id, prediction_url } = req.body;

  if (!chatbot_id) {
    return res.status(400).json({ error: 'chatbot_id is required' });
  }
  if (!prediction_url) {
    return res.status(400).json({ error: 'prediction_url is required' });
  }

  try {
    const conversations = await pool.query('SELECT * FROM conversations WHERE chatbot_id = $1', [
      chatbot_id,
    ]);
    if (conversations.rows.length === 0) {
      return res
        .status(404)
        .json({ error: 'No conversations found for the given chatbot_id' });
    }

    for (let conversation of conversations.rows) {
      const conversationText = conversation.conversation_data;
      const { emne, score, lacking_info, fallback } = await getEmneAndScore(conversationText, prediction_url);

      await pool.query(
        `UPDATE conversations
         SET emne = $1, score = $2, lacking_info = $3, fallback = $4
         WHERE id = $5`,
        [emne, score, lacking_info, fallback, conversation.id]
      );
    }

    return res.status(200).json({ message: 'Conversations updated successfully' });
  } catch (error) {
    console.error('Error updating conversations:', error);
    res
      .status(500)
      .json({ error: 'Internal server error', details: error.message });
  }
});

// Helper for prediction
const getEmneAndScore = async (conversationText, prediction_url) => {
  try {
    const response = await fetch(prediction_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ question: conversationText }),
    });
    const result = await response.json();
    const text = result.text;

    const emneMatch = text.match(/Emne\(([^)]+)\)/);
    const scoreMatch = text.match(/Happy\(([^)]+)\)/);
    const infoMatch = text.match(/info\(([^)]+)\)/i);
    const fallbackMatch = text.match(/fallback\(([^)]+)\)/i);

    const emne = emneMatch ? emneMatch[1] : null;
    const score = scoreMatch ? scoreMatch[1] : null;
    const lacking_info = infoMatch && infoMatch[1].toLowerCase() === 'yes' ? true : false;
    const fallback = fallbackMatch ? fallbackMatch[1].toLowerCase() === 'yes' : null;

    return { emne, score, lacking_info, fallback };
  } catch (error) {
    console.error('Error getting emne, score, and lacking_info:', error);
    return { emne: null, score: null, lacking_info: false, fallback: null };
  }
};

/* ===============================
   CRON JOB for Expiration Cleanup
================================ */
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
   Report Generation Endpoint
================================ */
app.post('/generate-report', authenticateToken, async (req, res) => {
  try {
    const { statisticsData, timePeriod, chatbot_id, includeTextAnalysis, includeGPTAnalysis, maxConversations } = req.body;
    
    if (!statisticsData) {
      return res.status(400).json({ error: 'Statistics data is required' });
    }
    
    // Get user data including chatbot IDs and company info
    const userResult = await pool.query('SELECT chatbot_ids, company_info FROM users WHERE id = $1', [req.user.userId]);
    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: 'User not found' });
    }
    
    // Get company info to pass to GPT analysis
    const companyInfo = userResult.rows[0].company_info;
    
    // Add company info to statistics data
    if (companyInfo) {
      statisticsData.companyInfo = companyInfo;
    }
    
    // Get chatbot_id from the request or use user's chatbot IDs
    let chatbotIds;
    if (!chatbot_id || chatbot_id === 'ALL') {
      // Get chatbot IDs from previously fetched user data
      if (!userResult.rows[0].chatbot_ids) {
        return res.status(400).json({ error: 'No chatbot IDs found for user' });
      }
      chatbotIds = userResult.rows[0].chatbot_ids;
    } else {
      // Use the specific chatbot ID
      chatbotIds = [chatbot_id];
    }
    
    // Prepare date range for analysis based on time period
    let start_date = null;
    let end_date = new Date().toISOString();
    
    if (timePeriod === '7') {
      const date = new Date();
      date.setDate(date.getDate() - 7);
      start_date = date.toISOString();
    } else if (timePeriod === '30') {
      const date = new Date();
      date.setDate(date.getDate() - 30);
      start_date = date.toISOString();
    } else if (timePeriod === 'yesterday') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      start_date = yesterday.toISOString();
      end_date = new Date(yesterday.setHours(23, 59, 59, 999)).toISOString();
    } else if (timePeriod.custom && timePeriod.startDate && timePeriod.endDate) {
      start_date = new Date(timePeriod.startDate).toISOString();
      end_date = new Date(timePeriod.endDate).toISOString();
    }
    
    // Get text analysis if we have enough data
    let textAnalysisResults = null;
    try {
      console.log("Fetching conversation data for text analysis...");
      
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
      console.log(`Found ${result.rows.length} conversations with scores for analysis`);
      
      // Validate and log a sample conversation for debugging
      if (result.rows.length > 0) {
        try {
          const sampleConversation = result.rows[0];
          console.log("Sample conversation ID:", sampleConversation.id);
          console.log("Sample conversation score:", sampleConversation.score);
          console.log("Sample conversation emne:", sampleConversation.emne);
          console.log("Sample conversation emne type:", typeof sampleConversation.emne);
          
          // Parse and check the conversation_data structure
          const conversationData = typeof sampleConversation.conversation_data === 'string'
            ? JSON.parse(sampleConversation.conversation_data)
            : sampleConversation.conversation_data;
            
          if (Array.isArray(conversationData)) {
            console.log("Sample conversation structure (first 3 messages):", 
              JSON.stringify(conversationData.slice(0, Math.min(3, conversationData.length)), null, 2));
            
            // Check for expected structure
            const hasUserMessages = conversationData.some(msg => msg && msg.isUser === true);
            console.log("Has user messages:", hasUserMessages);
            
            // If we don't have the expected structure, try to fix the data
            if (!hasUserMessages) {
              console.log("Conversation data doesn't have isUser property, trying to fix...");
              
              // Fix the data by inferring structure - assume odd indexes are user messages
              result.rows = result.rows.map(conv => {
                try {
                  let data = typeof conv.conversation_data === 'string'
                    ? JSON.parse(conv.conversation_data)
                    : conv.conversation_data;
                    
                  if (Array.isArray(data)) {
                    // Transform to expected format
                    data = data.map((msg, idx) => {
                      if (typeof msg === 'string') {
                        return { text: msg, isUser: idx % 2 === 1 };
                      } else if (typeof msg === 'object' && msg !== null) {
                        return { ...msg, isUser: msg.isUser !== undefined ? msg.isUser : idx % 2 === 1 };
                      }
                      return msg;
                    });
                    
                    return { ...conv, conversation_data: data };
                  }
                } catch (error) {
                  console.warn(`Could not fix conversation ${conv.id}:`, error.message);
                }
                return conv;
              });
              
              console.log("Data transformation applied");
            }
          } else {
            console.log("Conversation data is not an array");
          }
        } catch (validateError) {
          console.error("Error validating conversation data:", validateError);
        }
      }
      
      if (result.rows.length >= 10) {
        // We have enough data for analysis
        console.log("Performing text analysis on conversation data...");
        console.log("Using CPU throttling to prevent server overload. This may take a bit longer but ensures stability.");
        textAnalysisResults = await analyzeConversations(result.rows);
        
        if (textAnalysisResults && !textAnalysisResults.error) {
          console.log("Text analysis completed successfully");
          console.log(`Training size: ${textAnalysisResults.trainingSize}, Testing size: ${textAnalysisResults.testingSize}`);
          console.log(`Valid training: ${textAnalysisResults.validTrainingSize}, Valid testing: ${textAnalysisResults.validTestingSize}`);
          
          // Verify we have data for the report
          const hasPositiveMonograms = textAnalysisResults.positiveCorrelations?.monograms?.length > 0;
          const hasNegativeMonograms = textAnalysisResults.negativeCorrelations?.monograms?.length > 0;
          
          console.log(`Positive monograms: ${hasPositiveMonograms ? 'Yes' : 'No'}`);
          console.log(`Negative monograms: ${hasNegativeMonograms ? 'Yes' : 'No'}`);
        } else {
          console.log("Text analysis error:", textAnalysisResults?.error || "Unknown error");
        }
      } else {
        console.log("Insufficient conversation data for text analysis");
      }
    } catch (error) {
      console.error('Error performing text analysis:', error);
      // Continue with report generation even if analysis fails
    }
    
    // Include text analysis in the statistics data if available and requested
    if (includeTextAnalysis && textAnalysisResults && !textAnalysisResults.error) {
      console.log("Adding text analysis results to statistics data");
      statisticsData.textAnalysis = textAnalysisResults;
      statisticsData.includeTextAnalysis = true;
    } else {
      console.log("Text analysis not requested or not available");
    }
    
    // Generate GPT analysis if requested
    if (includeGPTAnalysis) {
      try {
        console.log("Generating GPT analysis...");
        
        // Fetch conversation content if maxConversations > 0
        let conversationContents = [];
        if (maxConversations > 0) {
          console.log(`Fetching up to ${maxConversations} conversations for GPT analysis...`);
          
          try {
            // Build query to fetch conversations
            let queryText = `
              SELECT id, created_at, conversation_data, emne, score, customer_rating
              FROM conversations
              WHERE chatbot_id = ANY($1)
            `;
            let queryParams = [chatbotIds];
            let paramIndex = 2;
            
            // Add date filters if provided
            if (start_date && end_date) {
              queryText += ` AND created_at BETWEEN $${paramIndex++} AND $${paramIndex++}`;
              queryParams.push(start_date, end_date);
            }
            
            // Order by most recent and limit results
            queryText += ` ORDER BY created_at DESC LIMIT $${paramIndex++}`;
            queryParams.push(maxConversations);
            
            // Get conversations
            const result = await pool.query(queryText, queryParams);
            console.log(`Fetched ${result.rows.length} conversations for GPT analysis`);
            
            // Process conversations
            conversationContents = result.rows.map(conv => {
              const topic = conv.emne || 'Uncategorized';
              const score = conv.score || 'No score';
              const rating = conv.customer_rating || 'No rating';
              
              // Parse conversation data
              let messages = [];
              try {
                if (typeof conv.conversation_data === 'string') {
                  messages = JSON.parse(conv.conversation_data);
                } else {
                  messages = conv.conversation_data;
                }
                
                if (!Array.isArray(messages)) {
                  messages = [];
                }
                
                // Format messages
                const formattedMessages = messages
                  .filter(msg => msg && msg.text)
                  .map(msg => {
                    return {
                      text: msg.text,
                      isUser: msg.isUser === true
                    };
                  });
                
                return {
                  id: conv.id,
                  date: new Date(conv.created_at).toISOString(),
                  topic,
                  score,
                  rating,
                  messages: formattedMessages
                };
              } catch (error) {
                console.error(`Error processing conversation ${conv.id}:`, error.message);
                return {
                  id: conv.id,
                  date: new Date(conv.created_at).toISOString(),
                  topic,
                  score,
                  rating,
                  messages: [],
                  error: 'Error parsing conversation data'
                };
              }
            });
          } catch (convError) {
            console.error('Error fetching conversations for GPT analysis:', convError);
          }
        }
        
        // Create a progress tracking function for GPT analysis
        const gptProgressTracker = (status, percent) => {
          console.log(`GPT Analysis progress: ${status} (${percent}%)`);
        };
        
        try {
          // Pass progress tracker and maxConversations to GPT analysis
          const gptAnalysis = await generateGPTAnalysis(
            statisticsData, 
            timePeriod, 
            conversationContents, 
            maxConversations,
            gptProgressTracker
          );
          
          if (gptAnalysis) {
            console.log("GPT analysis generated successfully");
            statisticsData.gptAnalysis = gptAnalysis;
          } else {
            console.log("Failed to generate GPT analysis");
          }
        } catch (gptError) {
          console.error('Error generating GPT analysis:', gptError);
          // Add fallback content for the PDF if GPT analysis fails
          statisticsData.gptAnalysis = "GPT analysis could not be generated due to technical limitations. " +
            "Please try again with a smaller dataset or fewer conversations.";
          // Continue with report generation even if GPT analysis fails
        }
      } catch (gptError) {
        console.error('Error generating GPT analysis:', gptError);
        // Continue with report generation even if GPT analysis fails
      }
    }
    
    // Generate the PDF report
    console.log("Generating PDF report...");
    try {
      const pdfBuffer = await generateStatisticsReport(statisticsData, timePeriod);
      console.log("PDF report generated successfully, size:", pdfBuffer.length, "bytes");
      
      // Set appropriate headers for PDF download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=statistics-report.pdf');
      res.setHeader('Content-Length', pdfBuffer.length);
      
      // Send the PDF buffer as the response
      res.send(pdfBuffer);
    } catch (pdfError) {
      console.error('Error generating PDF report:', pdfError);
      res.status(500).json({ 
        error: 'Failed to generate PDF report', 
        details: pdfError.message,
        stack: pdfError.stack
      });
    }
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ error: 'Failed to generate report', details: error.message });
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

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    details: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
});

// Add this endpoint to delete a user
app.delete('/users/:id', authenticateToken, async (req, res) => {
  // Only admins can delete users
  if (!(req.user.isAdmin || req.user.isLimitedAdmin)) {
    return res.status(403).json({ error: 'Forbidden: Admins only' });
  }

  const { id } = req.params;
  
  try {
    // First check if the user exists
    const checkResult = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete any related data first 
    // (optional, depending on your database constraints and requirements)
    // For example, delete user's conversations
    await pool.query('DELETE FROM conversations WHERE user_id = $1', [id]);
    
    // Also delete Pinecone data
    const pineconeResult = await pool.query('SELECT * FROM pinecone_data WHERE user_id = $1', [id]);
    
    // For each piece of Pinecone data, delete from Pinecone first if needed
    for (const row of pineconeResult.rows) {
      try {
        // Use the helper function to get the appropriate API key for this index
        const pineconeApiKey = await getPineconeApiKeyForIndex(
          id, 
          row.pinecone_index_name, 
          row.namespace
        );
        
        if (pineconeApiKey && row.pinecone_vector_id && row.namespace) {
          const pineconeClient = new Pinecone({ apiKey: pineconeApiKey });
          const index = pineconeClient.index(row.namespace);
          await index.deleteOne(row.pinecone_vector_id, { namespace: row.namespace });
        }
      } catch (pineconeError) {
        console.error('Error deleting from Pinecone:', pineconeError);
        // Continue with other deletions even if Pinecone fails
      }
    }
    
    // Delete the Pinecone data records
    await pool.query('DELETE FROM pinecone_data WHERE user_id = $1', [id]);
    
    // Finally delete the user
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING username', [id]);
    
    res.status(200).json({ 
      message: 'User deleted successfully',
      username: result.rows[0].username 
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Database error', details: error.message });
  }
});

app.get('/users', authenticateToken, async (req, res) => {
  // Require full or limited admin
  if (!(req.user.isAdmin || req.user.isLimitedAdmin)) {
    return res.status(403).json({ error: 'Forbidden: Admins only' });
  }

  try {
    // If full admin, fetch all users, otherwise only the ones in accessibleUserIds
    let queryText = `
      SELECT id, username, is_admin, is_limited_admin, chatbot_ids, pinecone_api_key,
             pinecone_indexes, chatbot_filepath, thumbs_rating, monthly_payment
      FROM users`;
    let queryParams = [];

    if (req.user.isLimitedAdmin) {
      const ids = req.user.accessibleUserIds || [];
      if (ids.length === 0) {
        return res.json([]);
      }
      queryText += ' WHERE id = ANY($1)';
      queryParams.push(ids);
    }

    queryText += ' ORDER BY id DESC';

    const result = await pool.query(queryText, queryParams);
    const users = result.rows.map(user => {
      return {
        ...user,
        chatbot_filepath: user.chatbot_filepath || []
      };
    });
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Database error', details: error.message });
  }
});

app.get('/user/:id', authenticateToken, async (req, res) => {
  const userId = req.params.id;

  // Access control
  if (!(req.user.isAdmin || (req.user.isLimitedAdmin && (req.user.accessibleUserIds || []).includes(parseInt(userId))))) {
    return res.status(403).json({ error: 'Forbidden: You do not have access to this user' });
  }

  try {
    // Get full user details except password, including chatbot_filepath array
    const result = await pool.query(`
      SELECT id, username, is_admin, chatbot_ids, pinecone_api_key,
             pinecone_indexes, chatbot_filepath, thumbs_rating, monthly_payment
      FROM users
      WHERE id = $1
    `, [userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Ensure chatbot_filepath is always an array in the response
    const user = {
      ...result.rows[0],
      chatbot_filepath: result.rows[0].chatbot_filepath || []
    };
    
    // Parse pinecone_indexes if it's a string
    if (typeof user.pinecone_indexes === 'string') {
      try {
        user.pinecone_indexes = JSON.parse(user.pinecone_indexes);
      } catch (e) {
        console.error('Error parsing pinecone_indexes:', e);
        user.pinecone_indexes = [];
      }
    }
    
    res.json(user);
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ error: 'Database error', details: error.message });
  }
});

// Add this endpoint to update a user's chatbot IDs and filepaths
app.patch('/users/:id', authenticateToken, async (req, res) => {
  const targetId = parseInt(req.params.id);
  if (!(req.user.isAdmin || (req.user.isLimitedAdmin && (req.user.accessibleUserIds || []).includes(targetId)))) {
    return res.status(403).json({ error: 'Forbidden: You do not have permission to modify this user' });
  }

  const { chatbot_ids, chatbot_filepath, monthly_payment } = req.body;
  
  // Validate input
  if ((!chatbot_ids || !Array.isArray(chatbot_ids)) && 
      (!chatbot_filepath || !Array.isArray(chatbot_filepath)) &&
      (monthly_payment === undefined)) {
    return res.status(400).json({ 
      error: 'No valid data provided. At least one of chatbot_ids, chatbot_filepath, or monthly_payment must be provided.'
    });
  }
  
  // Validate monthly_payment if provided
  if (monthly_payment !== undefined && (isNaN(monthly_payment) || monthly_payment < 0)) {
    return res.status(400).json({ 
      error: 'monthly_payment must be a non-negative number.'
    });
  }
  
  try {
    // First check if the user exists
    const checkResult = await pool.query('SELECT * FROM users WHERE id = $1', [targetId]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Prepare the update query
    let updateFields = [];
    let queryParams = [];
    let paramIndex = 1;
    
    if (chatbot_ids && Array.isArray(chatbot_ids)) {
      updateFields.push(`chatbot_ids = $${paramIndex}`);
      queryParams.push(chatbot_ids);
      paramIndex++;
    }
    
    if (chatbot_filepath && Array.isArray(chatbot_filepath)) {
      updateFields.push(`chatbot_filepath = $${paramIndex}`);
      queryParams.push(chatbot_filepath);
      paramIndex++;
    }
    
    if (monthly_payment !== undefined) {
      updateFields.push(`monthly_payment = $${paramIndex}`);
      queryParams.push(monthly_payment);
      paramIndex++;
    }
    
    // Add the ID as the last parameter
    queryParams.push(targetId);
    
    // Execute the update
    const updateQuery = `
      UPDATE users 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, username, chatbot_ids, chatbot_filepath, monthly_payment
    `;
    
    const result = await pool.query(updateQuery, queryParams);
    
    res.status(200).json({ 
      message: 'User updated successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Database error', details: error.message });
  }
});

// Add this endpoint to update a user's Pinecone indexes
app.put('/user-indexes/:id', authenticateToken, async (req, res) => {
  // Only admins or the user themselves can update indexes
  if (!req.user.isAdmin && req.user.userId != req.params.id) {
    return res.status(403).json({ error: 'Forbidden: You can only modify your own indexes' });
  }

  const { id } = req.params;
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
    const checkResult = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Convert the array to JSON string
    const indexesJson = JSON.stringify(pinecone_indexes);
    
    // Update the user's indexes
    const result = await pool.query(
      'UPDATE users SET pinecone_indexes = $1 WHERE id = $2 RETURNING id, username',
      [indexesJson, id]
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

// Add this endpoint to reset a user's password (admin only)
app.post('/reset-password/:id', authenticateToken, async (req, res) => {
  const targetId = parseInt(req.params.id);
  if (!(req.user.isAdmin || (req.user.isLimitedAdmin && (req.user.accessibleUserIds || []).includes(targetId)))) {
    return res.status(403).json({ error: 'Forbidden: You do not have permission to reset this user\'s password' });
  }

  const { newPassword } = req.body;
  
  // Validate input
  if (!newPassword || newPassword.trim() === '') {
    return res.status(400).json({ error: 'New password is required' });
  }
  
  try {
    // First check if the user exists
    const checkResult = await pool.query('SELECT * FROM users WHERE id = $1', [targetId]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update the user's password
    const result = await pool.query(
      'UPDATE users SET password = $1 WHERE id = $2 RETURNING id, username',
      [hashedPassword, targetId]
    );
    
    res.status(200).json({ 
      message: 'Password reset successfully',
      user: {
        id: result.rows[0].id,
        username: result.rows[0].username
      } 
    });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Database error', details: error.message });
  }
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
        chatbot_ids
      FROM users 
      ORDER BY monthly_payment DESC NULLS LAST
    `;
    
    console.log('Executing users query...');
    const usersResult = await pool.query(usersQuery);
    const users = usersResult.rows;
    console.log(`Found ${users.length} users`);

    // For each user, calculate their message statistics
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
        
        if (!Array.isArray(chatbotIds) || chatbotIds.length === 0) {
          console.log(`User ${user.username} has no chatbot IDs`);
          return {
            ...user,
            total_messages: 0,
            monthly_payment: parseFloat(user.monthly_payment) || 0
          };
        }

        console.log(`User ${user.username} owns chatbots: ${chatbotIds.join(', ')}`);

        // Get all conversations for chatbots owned by this user
        const conversationsQuery = `
          SELECT 
            conversation_data,
            created_at,
            chatbot_id
          FROM conversations 
          WHERE chatbot_id = ANY($1)
        `;
        
        const conversationsResult = await pool.query(conversationsQuery, [chatbotIds]);
        const conversations = conversationsResult.rows;
        console.log(`Found ${conversations.length} conversations for user ${user.username}'s chatbots`);

        // Calculate total messages from all conversations for this user's chatbots
        let totalMessages = 0;
        let monthlyMessages = 0;
        let lastMonthMessages = 0;
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
          let conversationData = conv.conversation_data;
          
          // Parse conversation_data if it's a string
          if (typeof conversationData === 'string') {
            try {
              conversationData = JSON.parse(conversationData);
            } catch (e) {
              console.error('Error parsing conversation_data:', e);
              conversationData = [];
            }
          }
          
          // Ensure it's an array
          if (Array.isArray(conversationData)) {
            // Count user messages (messages from the chatbot users, not the dashboard user)
            const userMessages = conversationData.filter(msg => 
              msg && (msg.isUser === true || msg.sender === 'user')
            );
            totalMessages += userMessages.length;
            
            // Count monthly messages (only from last 30 days)
            const conversationDate = new Date(conv.created_at);
            if (conversationDate >= thirtyDaysAgo) {
              monthlyMessages += userMessages.length;
            }
            
            // Count last month messages (previous calendar month)
            if (conversationDate >= lastMonthStart && conversationDate <= lastMonthEnd) {
              lastMonthMessages += userMessages.length;
            }
          }
        });

        // Calculate average monthly messages: (total messages / days active) * 30
        const averageDailyMessages = totalMessages / daysActive;
        const averageMonthlyMessages = averageDailyMessages * 30;

        // Safely parse monthly_payment
        let monthlyPayment = 0;
        if (user.monthly_payment !== null && user.monthly_payment !== undefined) {
          monthlyPayment = parseFloat(user.monthly_payment) || 0;
        }

        console.log(`User ${user.username}: ${totalMessages} total, ${averageDailyMessages.toFixed(2)} avg daily, ${Math.round(averageMonthlyMessages)} avg monthly (daily*30), ${monthlyMessages} last 30 days, ${lastMonthMessages} last month, ${monthlyPayment} kr payment`);

        return {
          ...user,
          total_messages: totalMessages,
          monthly_messages: monthlyMessages, // Last 30 days
          average_monthly_messages: Math.round(averageMonthlyMessages),
          last_month_messages: lastMonthMessages,
          days_active: daysActive,
          monthly_payment: monthlyPayment
        };
      } catch (error) {
        console.error(`Error calculating stats for user ${user.username}:`, error);
        // Return user with default stats if there's an error
        return {
          ...user,
          total_messages: 0,
          monthly_payment: parseFloat(user.monthly_payment) || 0
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

// Add this before the app.listen section, near other user-related endpoints

// Add endpoint to update company information
app.put('/update-company-info', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { company_info } = req.body;

  if (company_info === undefined) {
    return res.status(400).json({ error: 'company_info field is required' });
  }

  try {
    // Update company_info in the users table
    const result = await pool.query(
      'UPDATE users SET company_info = $1 WHERE id = $2 RETURNING id, username, company_info',
      [company_info, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json({
      message: 'Company information updated successfully',
      user: {
        id: result.rows[0].id,
        username: result.rows[0].username,
        company_info: result.rows[0].company_info
      }
    });
  } catch (error) {
    console.error('Error updating company information:', error);
    return res.status(500).json({ error: 'Database error', details: error.message });
  }
});

// Allow admins to update company info for any user
app.put('/admin/update-company-info/:userId', authenticateToken, async (req, res) => {
  // Check if user is admin
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Forbidden: Admins only' });
  }

  const targetUserId = req.params.userId;
  const { company_info } = req.body;

  if (company_info === undefined) {
    return res.status(400).json({ error: 'company_info field is required' });
  }

  try {
    // Update company_info in the users table
    const result = await pool.query(
      'UPDATE users SET company_info = $1 WHERE id = $2 RETURNING id, username, company_info',
      [company_info, targetUserId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json({
      message: 'Company information updated successfully',
      user: {
        id: result.rows[0].id,
        username: result.rows[0].username,
        company_info: result.rows[0].company_info
      }
    });
  } catch (error) {
    console.error('Error updating company information:', error);
    return res.status(500).json({ error: 'Database error', details: error.message });
  }
});

// Add this endpoint after the other company info endpoints
app.get('/company-info', authenticateToken, async (req, res) => {
  const userId = req.user.userId;

  try {
    // Get user's company info
    const result = await pool.query(
      'SELECT company_info FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json({
      company_info: result.rows[0].company_info || '' 
    });
  } catch (error) {
    console.error('Error fetching company information:', error);
    return res.status(500).json({ error: 'Database error', details: error.message });
  }
});

// New endpoint to update agent name
app.put('/update-agent-name', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { agent_name } = req.body;

  if (!agent_name || typeof agent_name !== 'string' || agent_name.trim() === '') {
    return res.status(400).json({ error: 'agent_name is required and must be a non-empty string' });
  }

  try {
    const result = await pool.query(
      'UPDATE users SET agent_name = $1 WHERE id = $2 RETURNING id, username, agent_name',
      [agent_name.trim(), userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json({
      message: 'Agent name updated successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating agent name:', error);
    return res.status(500).json({ error: 'Database error', details: error.message });
  }
});

// New endpoint to update profile picture
app.put('/update-profile-picture', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { profile_picture } = req.body;

  if (!profile_picture || typeof profile_picture !== 'string' || profile_picture.trim() === '') {
    return res.status(400).json({ error: 'profile_picture is required and must be a non-empty string' });
  }

  try {
    const updateResult = await pool.query(
      'UPDATE users SET profile_picture = $1 WHERE id = $2 RETURNING id, username, profile_picture',
      [profile_picture.trim(), userId]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json({
      message: 'Profile picture updated successfully',
      user: updateResult.rows[0]
    });
  } catch (error) {
    console.error('Error updating profile picture:', error);
    return res.status(500).json({ error: 'Database error', details: error.message });
  }
});

// Upload logo/image endpoint for profile pictures
app.post('/upload-logo', authenticateToken, async (req, res) => {
  try {
    // Handle both multipart form data and direct base64
    let imageData = null;
    let mimeType = null;
    
    if (req.body.image) {
      // Handle base64 data from form data
      const base64Data = req.body.image;
      if (base64Data.startsWith('data:')) {
        // Extract mime type and base64 data
        const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          mimeType = matches[1];
          imageData = matches[2];
        } else {
          return res.status(400).json({ error: 'Invalid base64 image format' });
        }
      } else {
        return res.status(400).json({ error: 'Image must be base64 encoded with data URL format' });
      }
    } else {
      return res.status(400).json({ error: 'No image data provided' });
    }

    // Validate mime type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(mimeType)) {
      return res.status(400).json({ error: 'Invalid file type. Allowed types: JPEG, PNG, GIF, WebP' });
    }

    // Validate base64 size (approximate file size check)
    const sizeInBytes = (imageData.length * 3) / 4;
    const maxSizeInBytes = 5 * 1024 * 1024; // 5MB
    if (sizeInBytes > maxSizeInBytes) {
      return res.status(400).json({ error: 'File size too large. Maximum 5MB allowed.' });
    }

    // For now, return the data URL as the "uploaded" URL
    // In production, you would upload to a cloud service like Cloudinary or AWS S3
    const dataUrl = `data:${mimeType};base64,${imageData}`;
    
    return res.status(200).json({
      message: 'Image uploaded successfully',
      url: dataUrl
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    return res.status(500).json({ error: 'Upload failed', details: error.message });
  }
});

// Retrieve livechat conversation for widget polling
app.get('/livechat-conversation', async (req, res) => {
  const { user_id, chatbot_id } = req.query;

  if (!user_id || !chatbot_id) {
    return res.status(400).json({ error: 'user_id and chatbot_id are required' });
  }

  try {
    const result = await pool.query(
      `SELECT conversation_data FROM conversations
       WHERE user_id = $1 AND chatbot_id = $2 AND is_livechat = TRUE
       ORDER BY created_at DESC LIMIT 1`,
      [user_id, chatbot_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    let data = result.rows[0].conversation_data;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (e) {
        console.error('Error parsing conversation_data JSON:', e);
      }
    }

    res.json({ conversation_data: data });
  } catch (err) {
    console.error('Error fetching livechat conversation:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

/* ================================
   Support Status Endpoints
================================ */

// Get support status for a specific chatbot
app.get('/support-status/:chatbot_id', async (req, res) => {
  const { chatbot_id } = req.params;

  if (!chatbot_id) {
    return res.status(400).json({ error: 'chatbot_id is required' });
  }

  try {
    // Get all users with livechat enabled for this chatbot
    const result = await pool.query(
      `SELECT ss.user_id, ss.is_live, u.username 
       FROM support_status ss
       JOIN users u ON ss.user_id = u.id
       WHERE ss.chatbot_id = $1 AND u.livechat = true`,
      [chatbot_id]
    );

    // Check if any support agent is live
    const isAnyAgentLive = result.rows.some(row => row.is_live);

    res.json({ 
      support_available: isAnyAgentLive,
      agents: result.rows
    });
  } catch (err) {
    console.error('Error fetching support status:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// Update support status for a user
app.post('/support-status', authenticateToken, async (req, res) => {
  const { chatbot_id, is_live } = req.body;
  const user_id = req.user.userId;

  if (!chatbot_id || typeof is_live !== 'boolean') {
    return res.status(400).json({ error: 'chatbot_id and is_live (boolean) are required' });
  }

  try {
    // Check if user has livechat enabled
    const userCheck = await pool.query(
      'SELECT livechat FROM users WHERE id = $1',
      [user_id]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!userCheck.rows[0].livechat) {
      return res.status(403).json({ error: 'User does not have livechat access' });
    }

    // Upsert support status
    const result = await pool.query(
      `INSERT INTO support_status (user_id, chatbot_id, is_live, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, chatbot_id)
       DO UPDATE SET is_live = $3, updated_at = NOW()
       RETURNING *`,
      [user_id, chatbot_id, is_live]
    );

    res.json({
      message: 'Support status updated successfully',
      status: result.rows[0]
    });
  } catch (err) {
    console.error('Error updating support status:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// Get current user's support status for all their chatbots
app.get('/my-support-status', authenticateToken, async (req, res) => {
  const user_id = req.user.userId;

  try {
    // Check if user has livechat enabled
    const userCheck = await pool.query(
      'SELECT livechat, chatbot_ids FROM users WHERE id = $1',
      [user_id]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!userCheck.rows[0].livechat) {
      return res.status(403).json({ error: 'User does not have livechat access' });
    }

    const result = await pool.query(
      'SELECT * FROM support_status WHERE user_id = $1',
      [user_id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching user support status:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

/* ================================
   Freshdesk Ticket Creation Proxy
================================ */

// POST /api/create-freshdesk-ticket - Proxy for Freshdesk ticket creation to avoid CORS issues
app.post('/api/create-freshdesk-ticket', async (req, res) => {
  const requestStartTime = Date.now();
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Log sanitized request data for debugging
    const sanitizedRequest = {
      email: req.body.email,
      subject: req.body.subject,
      hasAttachments: req.body.attachments?.length > 0,
      groupId: req.body.group_id,
      productId: req.body.product_id,
      descriptionLength: req.body.description?.length || 0,
      priority: req.body.priority,
      status: req.body.status,
      type: req.body.type,
      hasName: !!req.body.name,
      requestId: requestId
    };
    
    console.log("🎫 API: Received Freshdesk ticket creation request", {
      sanitizedRequest,
      timestamp: new Date().toISOString(),
      userAgent: req.get('User-Agent'),
      contentType: req.get('Content-Type'),
      contentLength: req.get('Content-Length'),
      origin: req.get('Origin')
    });
    
    // Validate required fields
    const { email, subject, description } = req.body;
    if (!email || !subject || !description) {
      console.error("🎫 API: Validation failed - missing required fields", {
        requestId,
        hasEmail: !!email,
        hasSubject: !!subject,
        hasDescription: !!description,
        requestTime: Date.now() - requestStartTime
      });
      
      return res.status(400).json({ 
        error: 'Missing required fields: email, subject, and description are required' 
      });
    }

    console.log("🎫 API: Validation passed, calling Freshdesk handler", {
      requestId,
      validationTime: Date.now() - requestStartTime
    });

    // Call the Freshdesk handler
    const handlerStartTime = Date.now();
    const result = await createFreshdeskTicket(req.body);
    const handlerTime = Date.now() - handlerStartTime;
    
    console.log("🎫 API: Freshdesk handler completed successfully", {
      requestId,
      ticketId: result.id,
      handlerTime,
      totalTime: Date.now() - requestStartTime,
      email: req.body.email
    });
    
    // Return the ticket ID in the format expected by the frontend
    res.status(201).json({
      ticket_id: result.id,
      message: 'Freshdesk ticket created successfully',
      freshdesk_response: result
    });
    
  } catch (error) {
    const errorTime = Date.now() - requestStartTime;
    
    console.error("🎫 API: Error creating Freshdesk ticket", {
      requestId,
      error: error.message,
      errorType: error.constructor.name,
      errorTime,
      email: req.body?.email,
      stack: error.stack?.split('\n').slice(0, 3).join('\n') // First 3 lines of stack trace
    });
    
    // Enhanced error logging for dashboard
    const errorDetails = {
      type: 'freshdesk_api_endpoint_error',
      requestId,
      email: req.body?.email,
      errorTime,
      userAgent: req.get('User-Agent'),
      origin: req.get('Origin'),
      requestBody: {
        email: req.body?.email,
        subject: req.body?.subject,
        hasAttachments: req.body?.attachments?.length > 0,
        descriptionLength: req.body?.description?.length || 0
      }
    };
    
    // Log to database for dashboard (similar to frontend logError)
    try {
      await pool.query(
        `INSERT INTO error_logs (chatbot_id, user_id, error_category, error_message, error_details, stack_trace)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          'backend_api',
          null,
          'API_ERROR',
          error.message,
          JSON.stringify(errorDetails),
          error.stack
        ]
      );
    } catch (dbError) {
      console.error("🎫 API: Failed to log error to database", dbError);
    }
    
    // Return a structured error response
    res.status(500).json({
      error: 'Failed to create Freshdesk ticket',
      message: error.message,
      details: error.stack,
      request_id: requestId
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

/* ================================
   Purchases (Chatbot conversion tracking)
================================ */

// Simple helper to validate purchase payloads
function validatePurchasePayload(body) {
  const { user_id, chatbot_id, amount } = body;
  if (!user_id || user_id.toString().trim() === "") {
    return "user_id is required";
  }
  if (!chatbot_id || chatbot_id.toString().trim() === "") {
    return "chatbot_id is required";
  }
  if (amount === undefined || amount === null || isNaN(parseFloat(amount))) {
    return "amount must be a valid number";
  }
  return null;
}

/*
  POST /purchases
  Body: { user_id: string, chatbot_id: string, amount: number }
  Creates a purchase record attributed to a chatbot conversation.
*/
app.post('/purchases', async (req, res) => {
  try {
    const validationError = validatePurchasePayload(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const { user_id, chatbot_id, amount } = req.body;

    const result = await pool.query(
      `INSERT INTO purchases (user_id, chatbot_id, amount)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [user_id, chatbot_id, parseFloat(amount)]
    );

    return res.status(201).json({ message: 'Purchase recorded', purchase: result.rows[0] });
  } catch (err) {
    console.error('Error recording purchase:', err);
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
});

/*
  GET /purchases/:chatbot_id
  Optional query params: user_id (filter by user), start_date, end_date
  Returns list of purchases for a chatbot – useful for dashboard stats.
*/
app.get('/purchases/:chatbot_id', authenticateToken, async (req, res) => {
  const { chatbot_id } = req.params;
  const { user_id, start_date, end_date } = req.query;

  if (!chatbot_id) {
    return res.status(400).json({ error: 'chatbot_id is required' });
  }

  try {
    let queryText = `SELECT * FROM purchases WHERE chatbot_id = $1`;
    const queryParams = [chatbot_id];
    let idx = 2;

    if (user_id) {
      queryText += ` AND user_id = $${idx++}`;
      queryParams.push(user_id);
    }
    if (start_date && end_date) {
      queryText += ` AND created_at BETWEEN $${idx++} AND $${idx++}`;
      queryParams.push(start_date, end_date);
    }

    queryText += ' ORDER BY created_at DESC';

    const result = await pool.query(queryText, queryParams);
    return res.json(result.rows);
  } catch (err) {
    console.error('Error fetching purchases:', err);
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// After Express app is initialised and authenticateToken is declared but before app.listen
registerPromptTemplateV2Routes(app, pool, authenticateToken);

/* ================================
   Error Logging Endpoints
================================ */

// Helper function to categorize errors automatically
function categorizeError(errorMessage, errorDetails) {
  const message = errorMessage.toLowerCase();
  
  if (message.includes('api') || message.includes('fetch') || message.includes('request')) {
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
      stack_trace 
    } = req.body;

    if (!chatbot_id || !error_message) {
      return res.status(400).json({ error: 'chatbot_id and error_message are required' });
    }

    // Automatically categorize the error
    const error_category = categorizeError(error_message, error_details);

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

// GET /api/error-logs - Get error logs with filtering (admin only)
app.get('/api/error-logs', authenticateToken, async (req, res) => {
  // Only admins can view error logs
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Forbidden: Admins only' });
  }

  try {
    const {
      chatbot_id,
      error_category,
      start_date,
      end_date,
      page = 0,
      page_size = 50
    } = req.query;

    let queryText = `
      SELECT *
      FROM error_logs
      WHERE 1=1
    `;
    const queryParams = [];
    let paramIndex = 1;

    // Add filters
    if (chatbot_id) {
      queryText += ` AND chatbot_id = $${paramIndex++}`;
      queryParams.push(chatbot_id);
    }

    if (error_category) {
      queryText += ` AND error_category = $${paramIndex++}`;
      queryParams.push(error_category);
    }

    if (start_date && end_date) {
      queryText += ` AND created_at BETWEEN $${paramIndex++} AND $${paramIndex++}`;
      queryParams.push(start_date, end_date);
    }

    // Add pagination
    queryText += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    queryParams.push(parseInt(page_size), parseInt(page) * parseInt(page_size));

    const result = await pool.query(queryText, queryParams);
    
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching error logs:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// GET /api/error-statistics - Get error statistics (admin only)
app.get('/api/error-statistics', authenticateToken, async (req, res) => {
  // Only admins can view error statistics
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Forbidden: Admins only' });
  }

  try {
    const { start_date, end_date } = req.query;

    let dateFilter = '';
    const queryParams = [];
    let paramIndex = 1;

    if (start_date && end_date) {
      dateFilter = ` WHERE created_at BETWEEN $${paramIndex++} AND $${paramIndex++}`;
      queryParams.push(start_date, end_date);
    }

    // Get total error count
    const totalResult = await pool.query(
      `SELECT COUNT(*) as total_errors FROM error_logs${dateFilter}`,
      queryParams
    );

    // Get errors by category
    const categoryResult = await pool.query(
      `SELECT error_category, COUNT(*) as count
       FROM error_logs${dateFilter}
       GROUP BY error_category
       ORDER BY count DESC`,
      queryParams
    );

    // Get errors by chatbot
    const chatbotResult = await pool.query(
      `SELECT chatbot_id, COUNT(*) as count
       FROM error_logs${dateFilter}
       GROUP BY chatbot_id
       ORDER BY count DESC`,
      queryParams
    );



    // Get recent error trends (last 7 days)
    const trendResult = await pool.query(
      `SELECT DATE(created_at) as date, COUNT(*) as count
       FROM error_logs
       WHERE created_at >= NOW() - INTERVAL '7 days'
       GROUP BY DATE(created_at)
       ORDER BY date DESC`,
      []
    );

    res.json({
      total_errors: parseInt(totalResult.rows[0].total_errors),
      by_category: categoryResult.rows,
      by_chatbot: chatbotResult.rows,
      recent_trend: trendResult.rows
    });
  } catch (err) {
    console.error('Error fetching error statistics:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
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

// Modify the streamAnswer function to capture sourceDocuments
const streamAnswer = async (apiUrl, bodyObject, retryCount = 0) => {
  // ... existing code until the streaming while loop ...
  
  let currentAiText = "";
  let currentAiTextWithMarkers = "";
  let contextChunks = []; // Add this to store context chunks
  
  setIsLoading(true);

  while (!done) {
    try {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) {
        chunkBuffer += decoder.decode(value, { stream: true });
        const lines = chunkBuffer.split(/\r?\n/);
        chunkBuffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (!trimmed.startsWith("data:")) continue;

          const dataStr = trimmed.replace("data:", "").trim();
          if (dataStr === "[DONE]") {
            done = true;
            break;
          }

          let json;
          try {
            json = JSON.parse(dataStr);
          } catch (err) {
            chunkBuffer = trimmed + "\n" + chunkBuffer;
            continue;
          }

          if (json.event === "start") {
            console.log("Conversation started");
          } else if (json.event === "token") {
            // ... existing token handling code ...
          } else if (json.event === "sourceDocuments") {
            // NEW: Capture context chunks from sourceDocuments event
            console.log("Received sourceDocuments:", json.data);
            contextChunks = json.data || [];
          } else if (json.event === "end") {
            console.log("Conversation ended");
            done = true;
            scrollToBottom();
            resetInactivityTimer();
            break;
          } else if (json.event === "error") {
            console.error("SSE error event:", json.data);
            logError(json.data);
            done = true;
            break;
          }
        }
      }
    } catch (streamError) {
      // ... existing error handling ...
    }
  }
  
  setIsLoading(false);

  // ... existing code for handling buffered content ...

  return { 
    display: currentAiText, 
    withMarkers: currentAiTextWithMarkers,
    contextChunks: contextChunks // Return context chunks
  };
};

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
          conversationText
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
  fallback = null
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

