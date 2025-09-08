import express from 'express';
import pg from 'pg';
import jwt from 'jsonwebtoken';

const { Pool } = pg;
const router = express.Router();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Get Shopify credentials for a specific chatbot
router.get('/credentials/:chatbotId', authenticateToken, async (req, res) => {
  try {
    const { chatbotId } = req.params;

    const query = `
      SELECT id, shopify_api_key, shopify_secret_key, shopify_store,
             shopify_api_version, shopify_access_token, chatbot_id,
             created_at, updated_at
      FROM shopify_credentials
      WHERE chatbot_id = $1
    `;

    const result = await pool.query(query, [chatbotId]);

    if (result.rows.length === 0) {
      return res.json(null); // No credentials found for this chatbot
    }

    // Remove sensitive data from response
    const credentials = result.rows[0];
    const safeCredentials = {
      id: credentials.id,
      shopify_store: credentials.shopify_store,
      shopify_api_version: credentials.shopify_api_version,
      chatbot_id: credentials.chatbot_id,
      created_at: credentials.created_at,
      updated_at: credentials.updated_at,
      // Don't return actual API keys and tokens for security
      has_api_key: !!credentials.shopify_api_key,
      has_secret_key: !!credentials.shopify_secret_key,
      has_access_token: !!credentials.shopify_access_token
    };

    res.json(safeCredentials);
  } catch (error) {
    console.error('Error fetching Shopify credentials:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create or update Shopify credentials for a chatbot
router.post('/credentials', authenticateToken, async (req, res) => {
  try {
    const {
      chatbot_id,
      shopify_api_key,
      shopify_secret_key,
      shopify_store,
      shopify_api_version = '2024-10',
      shopify_access_token
    } = req.body;

    if (!chatbot_id) {
      return res.status(400).json({ error: 'chatbot_id is required' });
    }

    // Check if credentials already exist for this chatbot
    const existingQuery = 'SELECT id FROM shopify_credentials WHERE chatbot_id = $1';
    const existingResult = await pool.query(existingQuery, [chatbot_id]);

    let result;
    if (existingResult.rows.length > 0) {
      // Update existing credentials
      const updateQuery = `
        UPDATE shopify_credentials
        SET shopify_api_key = $1,
            shopify_secret_key = $2,
            shopify_store = $3,
            shopify_api_version = $4,
            shopify_access_token = $5,
            updated_at = CURRENT_TIMESTAMP
        WHERE chatbot_id = $6
        RETURNING id, chatbot_id, shopify_store, shopify_api_version, created_at, updated_at
      `;

      result = await pool.query(updateQuery, [
        shopify_api_key,
        shopify_secret_key,
        shopify_store,
        shopify_api_version,
        shopify_access_token,
        chatbot_id
      ]);
    } else {
      // Insert new credentials
      const insertQuery = `
        INSERT INTO shopify_credentials (
          shopify_api_key,
          shopify_secret_key,
          shopify_store,
          shopify_api_version,
          shopify_access_token,
          chatbot_id
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, chatbot_id, shopify_store, shopify_api_version, created_at, updated_at
      `;

      result = await pool.query(insertQuery, [
        shopify_api_key,
        shopify_secret_key,
        shopify_store,
        shopify_api_version,
        shopify_access_token,
        chatbot_id
      ]);
    }

    res.json({
      success: true,
      message: existingResult.rows.length > 0 ? 'Credentials updated successfully' : 'Credentials created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error saving Shopify credentials:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete Shopify credentials for a chatbot
router.delete('/credentials/:chatbotId', authenticateToken, async (req, res) => {
  try {
    const { chatbotId } = req.params;

    const deleteQuery = 'DELETE FROM shopify_credentials WHERE chatbot_id = $1 RETURNING id';
    const result = await pool.query(deleteQuery, [chatbotId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Credentials not found' });
    }

    res.json({
      success: true,
      message: 'Credentials deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting Shopify credentials:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all Shopify credentials (admin only - for overview)
router.get('/credentials', authenticateToken, async (req, res) => {
  try {
    const query = `
      SELECT id, shopify_store, shopify_api_version, chatbot_id,
             created_at, updated_at
      FROM shopify_credentials
      ORDER BY created_at DESC
    `;

    const result = await pool.query(query);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching all Shopify credentials:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as shopifyCredentialsRouter };
