import { Pinecone } from '@pinecone-database/pinecone';
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import OpenAI from 'openai';
import cron from 'node-cron'; // For scheduled clean-ups

const { Pool } = pg;

// Environment variables (or defaults)
const SECRET_KEY = process.env.SECRET_KEY || 'Megtigemaskiner00!';
const PORT = process.env.PORT || 3000;

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
async function generateEmbedding(text, openaiApiKey) {
  const openai = new OpenAI({ apiKey: openaiApiKey });
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-large',
    input: text,
  });
  return response.data[0].embedding;
}

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
  const { title, text, indexName, namespace, expirationTime } = req.body;
  const userId = req.user.userId;

  if (!title || !text || !indexName || !namespace) {
    return res
      .status(400)
      .json({ error: 'Title, text, indexName, and namespace are required' });
  }

  try {
    // Retrieve Pinecone key
    const userResult = await pool.query('SELECT pinecone_api_key FROM users WHERE id = $1', [
      userId,
    ]);
    const pineconeApiKey = userResult.rows[0].pinecone_api_key;
    if (!pineconeApiKey) {
      return res.status(400).json({ error: 'Pinecone API key not set' });
    }

    // Generate embedding
    const embedding = await generateEmbedding(text, process.env.OPENAI_API_KEY);

    // Initialize Pinecone
    const pineconeClient = new Pinecone({ apiKey: pineconeApiKey });
    const index = pineconeClient.index(namespace);

    // Create unique vector ID
    const vectorId = `vector-${Date.now()}`;

    // Prepare vector
    const vector = {
      id: vectorId,
      values: embedding,
      metadata: {
        userId: userId.toString(),
        text,
        title,
      },
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

    // Insert record
    const result = await pool.query(
      `INSERT INTO pinecone_data 
        (user_id, title, text, pinecone_vector_id, pinecone_index_name, namespace, expiration_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [userId, title, text, vectorId, indexName, namespace, expirationDateTime]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error upserting data:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Update existing data
app.put('/pinecone-data-update/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { title, text } = req.body;
  const userId = req.user.userId;

  if (!title || !text) {
    return res.status(400).json({ error: 'Title and text are required' });
  }

  try {
    // Retrieve existing record
    const dataResult = await pool.query(
      'SELECT * FROM pinecone_data WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (dataResult.rows.length === 0) {
      return res.status(404).json({ error: 'Data not found' });
    }

    const { pinecone_vector_id, pinecone_index_name, namespace } = dataResult.rows[0];

    // Retrieve Pinecone key
    const userResult = await pool.query('SELECT pinecone_api_key FROM users WHERE id = $1', [
      userId,
    ]);
    const pineconeApiKey = userResult.rows[0].pinecone_api_key;
    if (!pineconeApiKey) {
      return res.status(400).json({ error: 'Pinecone API key not set' });
    }

    // Generate new embedding
    const embedding = await generateEmbedding(text, process.env.OPENAI_API_KEY);

    // Upsert vector in Pinecone
    const pineconeClient = new Pinecone({ apiKey: pineconeApiKey });
    const index = pineconeClient.index(namespace);
    await index.upsert(
      [
        {
          id: pinecone_vector_id,
          values: embedding,
          metadata: {
            userId: userId.toString(),
            text,
            title,
          },
        },
      ],
      { namespace }
    );

    // Update DB
    const result = await pool.query(
      'UPDATE pinecone_data SET title = $1, text = $2 WHERE id = $3 AND user_id = $4 RETURNING *',
      [title, text, id, userId]
    );

    res.json(result.rows[0]);
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
    const parsedIndexes = typeof indexes === 'string' ? JSON.parse(indexes) : indexes;
    res.json(parsedIndexes);
  } catch (err) {
    console.error('Error retrieving indexes:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

app.get('/pinecone-data', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  try {
    const result = await pool.query(
      'SELECT * FROM pinecone_data WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    // Include expiration_time in the returned data
    res.json(
      result.rows.map((row) => ({
        title: row.title,
        text: row.text,
        id: row.id,
        pinecone_index_name: row.pinecone_index_name,
        namespace: row.namespace,
        expiration_time: row.expiration_time,
      }))
    );
  } catch (err) {
    console.error('Error retrieving data:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Delete data from both DB and Pinecone
app.delete('/pinecone-data/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;

  try {
    // Retrieve the record
    const dataResult = await pool.query(
      'SELECT pinecone_vector_id, pinecone_index_name, namespace FROM pinecone_data WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (dataResult.rows.length === 0) {
      return res.status(404).json({ error: 'Data not found' });
    }

    const { pinecone_vector_id, pinecone_index_name, namespace } = dataResult.rows[0];

    // Retrieve Pinecone API key
    const userResult = await pool.query('SELECT pinecone_api_key FROM users WHERE id = $1', [
      userId,
    ]);
    const pineconeApiKey = userResult.rows[0].pinecone_api_key;
    if (!pineconeApiKey) {
      return res.status(400).json({ error: 'Pinecone API key not set' });
    }

    // Delete from Pinecone
    const pineconeClient = new Pinecone({ apiKey: pineconeApiKey });
    const index = pineconeClient.index(namespace);
    await index.deleteOne(pinecone_vector_id, { namespace });

    // Delete from DB
    await pool.query('DELETE FROM pinecone_data WHERE id = $1 AND user_id = $2', [id, userId]);

    res.json({ message: 'Data deleted successfully' });
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
  } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    // Convert chatbot_ids to a JSON array or similar
    const chatbotIdsArray = chatbot_ids;

    const pineconeIndexesJSON = JSON.stringify(pinecone_indexes);

    const result = await pool.query(
      `INSERT INTO users (username, password, chatbot_ids, pinecone_api_key, pinecone_indexes, show_purchase, chatbot_filepath)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [username, hashedPassword, chatbotIdsArray, pinecone_api_key, pineconeIndexesJSON, show_purchase, chatbot_filepath]
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

   const token = jwt.sign({ userId: user.id, isAdmin: user.is_admin }, SECRET_KEY, { expiresIn: '1h' });

    let chatbotIds = user.chatbot_ids || [];
    if (typeof chatbotIds === 'string') {
      chatbotIds = JSON.parse(chatbotIds);
    }

    return res.json({
      token,
      chatbot_ids: chatbotIds,
      show_purchase: user.show_purchase,
      chatbot_filepath: user.chatbot_filepath,
     is_admin: user.is_admin    // <--- Return to client
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
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const updateResult = await client.query(
      `UPDATE conversations
       SET conversation_data = $3, emne = $4, score = $5, customer_rating = $6, lacking_info = $7
       WHERE user_id = $1 AND chatbot_id = $2
       RETURNING *`,
      [user_id, chatbot_id, conversation_data, emne, score, customer_rating, lacking_info]
    );

    if (updateResult.rows.length === 0) {
      const insertResult = await client.query(
        `INSERT INTO conversations
         (user_id, chatbot_id, conversation_data, emne, score, customer_rating, lacking_info)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
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
  let { conversation_data, user_id, chatbot_id, emne, score, customer_rating, lacking_info } =
    req.body;

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const user = jwt.verify(token, SECRET_KEY);
      req.user = user;
      user_id = user.userId;
    } catch (err) {
      return res.status(403).json({ error: 'Invalid or expired token', details: err.message });
    }
  }

  if (!user_id) {
    return res.status(400).json({ error: 'Missing user_id' });
  }
  if (!chatbot_id) {
    return res.status(400).json({ error: 'Missing chatbot_id' });
  }

  try {
    conversation_data = JSON.stringify(conversation_data);
    const result = await upsertConversation(
      user_id,
      chatbot_id,
      conversation_data,
      emne,
      score,
      customer_rating,
      lacking_info
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

/* 
  CHANGED: /conversations-metadata also uses ANY($1) for multiple IDs.
*/
app.get('/conversations-metadata', authenticateToken, async (req, res) => {
  const { chatbot_id, lacking_info, start_date, end_date } = req.query;

  if (!chatbot_id) {
    return res.status(400).json({ error: 'chatbot_id is required' });
  }

  try {
    const chatbotIds = chatbot_id.split(',');

    let queryText = `
      SELECT id, created_at, emne, customer_rating, bug_status
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
    const result = await pool.query('SELECT * FROM conversations WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error retrieving conversation:', err);
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

      const userResult = await pool.query('SELECT pinecone_api_key FROM users WHERE id = $1', [
        user_id,
      ]);
      const pineconeApiKey = userResult.rows[0].pinecone_api_key;
      if (!pineconeApiKey) {
        console.log(`Pinecone key missing for user ${user_id}, skipping ID ${id}`);
        continue;
      }

      const pineconeClient = new Pinecone({ apiKey: pineconeApiKey });
      const index = pineconeClient.index(namespace);
      await index.deleteOne(pinecone_vector_id, { namespace });

      await pool.query('DELETE FROM pinecone_data WHERE id = $1', [id]);
      console.log(`Expired chunk with ID ${id} removed from Pinecone and DB`);
    }
  } catch (err) {
    console.error('Error deleting expired data:', err);
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

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
