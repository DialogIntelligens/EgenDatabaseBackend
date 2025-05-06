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

const { Pool } = pg;

// Environment variables (or defaults)
const SECRET_KEY = process.env.SECRET_KEY || 'Megtigemaskiner00!';
const PORT = process.env.PORT || 3000;

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
app.use(cors());

// PostgreSQL pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

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
   CRM Endpoints
================================ */
app.post('/crm', async (req, res) => {
  const { websiteuserid, usedChatbot, madePurchase, chatbot_id } = req.body;

  if (!websiteuserid) {
    return res.status(400).json({ error: 'Missing websiteuserid' });
  }
  if (!chatbot_id) {
    return res.status(400).json({ error: 'Missing chatbot_id' });
  }

  try {
    console.log('Received data:', {
      websiteuserid,
      usedChatbot,
      madePurchase,
      chatbot_id,
    });

    // Convert to 'true'/'false' strings
    const incomingUsedChatbot =
      usedChatbot === 'true' || usedChatbot === true ? 'true' : 'false';
    const incomingMadePurchase =
      madePurchase === 'true' || madePurchase === true ? 'true' : 'false';

    // Upsert logic with CASE WHEN to preserve 'true'
    const query = `
      INSERT INTO crm (websiteuserid, user_id, usedChatbot, madePurchase, chatbot_id)
      VALUES ($1, $1, $2, $3, $4)
      ON CONFLICT (websiteuserid)
      DO UPDATE SET
        usedChatbot = CASE
          WHEN crm.usedchatbot = 'true' THEN 'true'
          ELSE EXCLUDED.usedchatbot
        END,
        madePurchase = CASE
          WHEN crm.madepurchase = 'true' THEN 'true'
          ELSE EXCLUDED.madepurchase
        END,
        chatbot_id = EXCLUDED.chatbot_id
      RETURNING *;
    `;
    const values = [websiteuserid, incomingUsedChatbot, incomingMadePurchase, chatbot_id];

    const result = await pool.query(query, values);
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error in /crm endpoint:', error);
    return res.status(500).json({ error: 'Database error', details: error.message });
  }
});

app.get('/crm', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM crm ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Database error', details: error.message });
  }
});

app.post('/crm-data-for-user', async (req, res) => {
  const { user_id, chatbot_id } = req.body;
  if (!user_id) {
    return res.status(400).json({ error: 'Missing user_id' });
  }
  if (!chatbot_id) {
    return res.status(400).json({ error: 'Missing chatbot_id' });
  }
  try {
    const result = await pool.query('SELECT * FROM crm WHERE user_id = $1 AND chatbot_id = $2', [
      user_id,
      chatbot_id,
    ]);
    if (result.rows.length === 0) {
      return res.json({ usedChatbot: false, madePurchase: false });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Database error', details: error.message });
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
        res.json(result.rows[0]);
      } catch (dbError) {
        // If metadata column doesn't exist, try without it
        console.error('Error with metadata column, trying without it:', dbError);
        const fallbackResult = await pool.query(
          'UPDATE pinecone_data SET title = $1, text = $2 WHERE id = $3 RETURNING *',
          [title, text, id]
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
    const result = await pool.query(
      'SELECT * FROM pinecone_data WHERE namespace = ANY($1) ORDER BY created_at DESC',
      [userNamespaces]
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
          group: group // Include group information
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
      await index.deleteOne(pinecone_vector_id, { namespace });

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
    show_purchase,
    chatbot_filepath,
   is_admin
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
         show_purchase,
         chatbot_filepath,
        is_admin
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,

      [
         username,
        hashedPassword,
        chatbotIdsArray,
        pinecone_api_key,
        pineconeIndexesJSON,
        show_purchase,
        chatbot_filepath || [],
        is_admin
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
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    // Sign the JWT, including isAdmin
    const token = jwt.sign({ userId: user.id, isAdmin: user.is_admin }, SECRET_KEY, { expiresIn: '4h' });

    // Start with the current user's chatbot_ids
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
    }

    return res.json({
      token,
      chatbot_ids: chatbotIds,
      show_purchase: user.show_purchase,
      chatbot_filepath: user.chatbot_filepath || [],
      is_admin: user.is_admin,
      thumbs_rating: user.thumbs_rating || false  // Add this line
    });
  } catch (err) {
    console.error('Error logging in:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});


app.delete('/conversations/:id', authenticateToken, async (req, res) => {
  // Only admins can delete single conversations
  if (!req.user.isAdmin) {
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
  const { bug_status, notes, lacking_info } = req.body;

  if (bug_status === undefined && notes === undefined && lacking_info === undefined) {
    return res
      .status(400)
      .json({ error: 'At least one of bug_status, notes, or lacking_info must be provided' });
  }

  try {
    const fields = [];
    const values = [];
    let idx = 1;

    if (bug_status !== undefined) {
      fields.push(`bug_status = $${idx++}`);
      values.push(bug_status);
    }
    if (notes !== undefined) {
      fields.push(`notes = $${idx++}`);
      values.push(notes);
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
      lacking_info
      // removed source_chunks parameter
    ) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const updateResult = await client.query(
          `UPDATE conversations
           SET conversation_data = $3, emne = $4, score = $5, customer_rating = $6, lacking_info = $7 
           WHERE user_id = $1 AND chatbot_id = $2
           RETURNING *`,
          // removed source_chunks ($8) from query and parameters
          [user_id, chatbot_id, conversation_data, emne, score, customer_rating, lacking_info]
        );

        if (updateResult.rows.length === 0) {
          const insertResult = await client.query(
            `INSERT INTO conversations
             (user_id, chatbot_id, conversation_data, emne, score, customer_rating, lacking_info)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            // removed source_chunks from query and parameters
            [user_id, chatbot_id, conversation_data, emne, score, customer_rating, lacking_info]
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
  // REMOVED: source_chunks from destructuring
  let {
    conversation_data,
    user_id,
    chatbot_id,
    emne,
    score,
    customer_rating,
    lacking_info
    // Note: form_data might also be in req.body depending on your frontend, add if needed
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

    // REMOVED: The block that stringified source_chunks separately
    // if (source_chunks) {
    //   source_chunks = JSON.stringify(source_chunks);
    // }

    // Call upsertConversation WITHOUT the source_chunks argument
    const result = await upsertConversation(
      user_id,
      chatbot_id,
      conversation_data, // This contains the embedded chunks
      emne,
      score,
      customer_rating,
      lacking_info
      // REMOVED: source_chunks argument
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
      FROM conversations
      WHERE chatbot_id = ANY($1)
    `;
    let queryParams = [chatbotIds];
    let paramIndex = 2;

    if (lacking_info === 'true' || lacking_info === 'false') {
      queryText += ` AND lacking_info = $${paramIndex++}`;
      queryParams.push(lacking_info === 'true');
    }

    if (start_date && end_date) {
      queryText += ` AND created_at BETWEEN $${paramIndex++} AND $${paramIndex++}`;
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

    let queryText = `
      SELECT COUNT(id) AS conversation_count
      FROM conversations
      WHERE chatbot_id = ANY($1)
    `;
    let queryParams = [chatbotIds];
    let paramIndex = 2;


    if (fejlstatus && fejlstatus !== '') {
      queryText += ` AND bug_status = $${paramIndex++}`;
      queryParams.push(fejlstatus);
    }
    if (customer_rating && customer_rating !== '') {
      queryText += ` AND customer_rating = $${paramIndex++}`;
      queryParams.push(customer_rating);
    }
    if (emne && emne !== '') {
      queryText += ` AND emne = $${paramIndex++}`;
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

    let queryText = `
      SELECT id, created_at, emne, customer_rating, bug_status, conversation_data, viewed
      FROM conversations
      WHERE chatbot_id = ANY($1)
    `;
    let queryParams = [chatbotIds];
    let paramIndex = 2;

    if (lacking_info === 'true' || lacking_info === 'false') {
      queryText += ` AND lacking_info = $${paramIndex++}`;
      queryParams.push(lacking_info === 'true');
    }

    if (start_date && end_date) {
      queryText += ` AND created_at BETWEEN $${paramIndex++} AND $${paramIndex++}`;
      queryParams.push(start_date, end_date);
    }
    if (fejlstatus && fejlstatus !== '') {
      queryText += ` AND bug_status = $${paramIndex++}`;
      queryParams.push(fejlstatus);
    }
    if (customer_rating && customer_rating !== '') {
      queryText += ` AND customer_rating = $${paramIndex++}`;
      queryParams.push(customer_rating);
    }
    if (emne && emne !== '') {
      queryText += ` AND emne = $${paramIndex++}`;
      queryParams.push(emne);
    }
    if (conversation_filter && conversation_filter.trim() !== '') {
      queryText += ` AND conversation_data::text ILIKE '%' || $${paramIndex++} || '%'`;
      queryParams.push(`${conversation_filter}`);
    }

    queryText += ` ORDER BY created_at DESC `;
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
    // Get the conversation
    const result = await pool.query('SELECT * FROM conversations WHERE id = $1', [id]);
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
      const { emne, score, lacking_info } = await getEmneAndScore(conversationText, prediction_url);

      await pool.query(
        `UPDATE conversations
         SET emne = $1, score = $2, lacking_info = $3
         WHERE id = $4`,
        [emne, score, lacking_info, conversation.id]
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

    const emne = emneMatch ? emneMatch[1] : null;
    const score = scoreMatch ? scoreMatch[1] : null;
    const lacking_info = infoMatch && infoMatch[1].toLowerCase() === 'yes' ? true : false;

    return { emne, score, lacking_info };
  } catch (error) {
    console.error('Error getting emne, score, and lacking_info:', error);
    return { emne: null, score: null, lacking_info: false };
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
        await index.deleteOne(pinecone_vector_id, { namespace });

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
    
    // Get chatbot_id from the request or use user's chatbot IDs
    let chatbotIds;
    if (!chatbot_id || chatbot_id === 'ALL') {
      // Get all chatbot IDs from the user
      const userResult = await pool.query('SELECT chatbot_ids FROM users WHERE id = $1', [req.user.userId]);
      if (userResult.rows.length === 0 || !userResult.rows[0].chatbot_ids) {
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
        
        const gptAnalysis = await generateGPTAnalysis(statisticsData, timePeriod, conversationContents);
        
        if (gptAnalysis) {
          console.log("GPT analysis generated successfully");
          statisticsData.gptAnalysis = gptAnalysis;
        } else {
          console.log("Failed to generate GPT analysis");
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
  if (!req.user.isAdmin) {
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
  // Only admins can list all users
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Forbidden: Admins only' });
  }

  try {
    // Return all needed fields, including the chatbot_filepath array
    const result = await pool.query(`
      SELECT id, username, is_admin, chatbot_ids, pinecone_api_key,
             pinecone_indexes, show_purchase, chatbot_filepath, thumbs_rating
      FROM users
      ORDER BY id DESC
    `);
    // Ensure chatbot_filepath is always an array in the response
    const users = result.rows.map(user => ({
      ...user,
      chatbot_filepath: user.chatbot_filepath || []
    }));
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Database error', details: error.message });
  }
});

app.get('/user/:id', authenticateToken, async (req, res) => {
  // Only admins can access user details
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Forbidden: Admins only' });
  }

  const userId = req.params.id;
  
  try {
    // Get full user details except password, including chatbot_filepath array
    const result = await pool.query(`
      SELECT id, username, is_admin, chatbot_ids, pinecone_api_key,
             pinecone_indexes, show_purchase, chatbot_filepath, thumbs_rating
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
  // Only admins can update users
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Forbidden: Admins only' });
  }

  const { id } = req.params;
  const { chatbot_ids, chatbot_filepath } = req.body;
  
  // Validate input
  if ((!chatbot_ids || !Array.isArray(chatbot_ids)) && 
      (!chatbot_filepath || !Array.isArray(chatbot_filepath))) {
    return res.status(400).json({ 
      error: 'No valid data provided. At least one of chatbot_ids or chatbot_filepath must be an array.'
    });
  }
  
  try {
    // First check if the user exists
    const checkResult = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
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
    
    // Add the ID as the last parameter
    queryParams.push(id);
    
    // Execute the update
    const updateQuery = `
      UPDATE users 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, username, chatbot_ids, chatbot_filepath
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

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});