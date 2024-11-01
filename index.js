import { Pinecone } from '@pinecone-database/pinecone';
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import OpenAI from 'openai';

const { Pool } = pg;



// Use environment variables for sensitive information
const SECRET_KEY = process.env.SECRET_KEY || 'Megtigemaskiner00!';
const PORT = process.env.PORT || 3000;

// Initialize Express app
const app = express();

// Middleware
app.use(bodyParser.json());
app.use(cors());


async function generateEmbedding(text, openaiApiKey) {
  const openai = new OpenAI({
    apiKey: openaiApiKey,
  });
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-large',
    input: text,
  });
  return response.data[0].embedding;
}



app.post('/pinecone-data', authenticateToken, async (req, res) => {
  const { text, indexName, namespace } = req.body; // Ensure these are coming in correctly
  const userId = req.user.userId;

  try {
    // Retrieve user's Pinecone API key
    const userResult = await pool.query(
      'SELECT pinecone_api_key FROM users WHERE id = $1',
      [userId]
    );
    const pineconeApiKey = userResult.rows[0].pinecone_api_key;

    if (!pineconeApiKey) {
      return res.status(400).json({ error: 'Pinecone API key not set' });
    }

    // Log indexName and namespace for debugging
    console.log("Index Name:", indexName, "Namespace:", namespace);

    // Generate embedding
    const embedding = await generateEmbedding(text, process.env.OPENAI_API_KEY);

    // Initialize Pinecone client and connect to selected index
    const pineconeClient = new Pinecone({ apiKey: pineconeApiKey });
    const index = pineconeClient.index(namespace);  // Use the correct index name

    const vector = {
      id: `vector-${Date.now()}`,
      values: embedding,
      metadata: {
        userId: userId.toString(),
        text,
      },
    };

    // Upsert vector to Pinecone in the specified namespace
    await index.upsert([vector], { namespace: namespace }); // Ensure namespace is specified here

    const result = await pool.query(
      `INSERT INTO pinecone_data (user_id, text, pinecone_vector_id, pinecone_index_name)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [userId, text, vector.id, namespace]
    );
    

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error upserting data:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});






app.get('/pinecone-indexes', authenticateToken, async (req, res) => {
  const userId = req.user.userId;

  try {
    const result = await pool.query(
      'SELECT pinecone_indexes FROM users WHERE id = $1',
      [userId]
    );

    // Directly use the `pinecone_indexes` if it's already in JSON format
    const indexes = result.rows[0].pinecone_indexes;

    // Check if `indexes` is an object, if not, parse it.
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
    res.json(result.rows);
  } catch (err) {
    console.error('Error retrieving data:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});





app.delete('/pinecone-data/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;

  try {
    // Retrieve the record to get the vector ID and pinecone index name
    const dataResult = await pool.query(
      'SELECT pinecone_vector_id, pinecone_index_name FROM pinecone_data WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (dataResult.rows.length === 0) {
      return res.status(404).json({ error: 'Data not found' });
    }

    const { pinecone_vector_id, pinecone_index_name } = dataResult.rows[0];

    // Retrieve user's Pinecone API key
    const userResult = await pool.query('SELECT pinecone_api_key FROM users WHERE id = $1', [userId]);
    const pineconeApiKey = userResult.rows[0].pinecone_api_key;

    if (!pineconeApiKey) {
      return res.status(400).json({ error: 'Pinecone API key not set' });
    }

    // Initialize Pinecone client and delete vector from specified index
    const pineconeClient = new Pinecone({ apiKey: pineconeApiKey });
    const index = pineconeClient.index(pinecone_index_name);

    await index.deleteOne(pinecone_vector_id);  // Remove specific vector by ID

    // Delete from database
    await pool.query('DELETE FROM pinecone_data WHERE id = $1 AND user_id = $2', [id, userId]);

    res.json({ message: 'Data deleted successfully' });
  } catch (err) {
    console.error('Error deleting data:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});







// Configure the PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) return res.sendStatus(401); // No token, return 401 Unauthorized

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) {
      console.log("JWT verification error:", err);
      return res.sendStatus(403); // Token invalid or expired, return 403 Forbidden
    }
    console.log("Authenticated user:", user); // Log user info
    req.user = user;
    next(); // Proceed to the next middleware or route handler
  });
}


app.post('/register', async (req, res) => {
  const { username, password, chatbot_id, pinecone_api_key, pinecone_index_name, pinecone_namespace } = req.body;

  try {
    // Hash the password before saving
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (username, password, chatbot_id, pinecone_api_key, pinecone_index_name, pinecone_namespace)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [username, hashedPassword, chatbot_id, pinecone_api_key, pinecone_index_name, pinecone_namespace]
    );

    res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    console.error('Error registering user:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});


app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    // Check if the user exists in the database
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const user = result.rows[0];

    // Compare the provided password with the stored hashed password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    // Generate a JWT token
    const token = jwt.sign({ userId: user.id }, SECRET_KEY, { expiresIn: '1h' });

    // Return the token and the chatbotID associated with the user
    res.json({ token, chatbot_id: user.chatbot_id });
  } catch (err) {
    console.error('Error logging in:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

app.patch('/conversations/:id', authenticateToken, async (req, res) => {
  const conversationId = req.params.id;
  const { bug_status, notes } = req.body;

  if (!bug_status && notes === undefined) {
    return res.status(400).json({ error: 'At least one of bug_status or notes must be provided' });
  }

  try {
    const fields = [];
    const values = [];
    let idx = 1;

    if (bug_status) {
      fields.push(`bug_status = $${idx++}`);
      values.push(bug_status);
    }

    if (notes !== undefined) {
      fields.push(`notes = $${idx++}`);
      values.push(notes);
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



async function upsertConversation(user_id, chatbot_id, conversation_data, emne, score, customer_rating) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Try to update first
    const updateResult = await client.query(
      `UPDATE conversations 
       SET conversation_data = $3, emne = $4, score = $5, customer_rating = $6
       WHERE user_id = $1 AND chatbot_id = $2
       RETURNING *`,
      [user_id, chatbot_id, conversation_data, emne, score, customer_rating]
    );
    
    if (updateResult.rows.length === 0) {
      // If no row was updated, insert a new one
      const insertResult = await client.query(
        `INSERT INTO conversations (user_id, chatbot_id, conversation_data, emne, score, customer_rating) 
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [user_id, chatbot_id, conversation_data, emne, score, customer_rating]
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



app.post('/conversations', async (req, res) => {
  let { conversation_data, user_id, chatbot_id, emne, score, customer_rating } = req.body;

  // If a token is provided, authenticate it
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const user = jwt.verify(token, SECRET_KEY);
      console.log("Authenticated user:", user);
      req.user = user;
      user_id = user.userId; // Overwrite user_id with authenticated user ID
    } catch (err) {
      console.log("JWT verification error:", err);
      return res.status(403).json({ error: 'Invalid or expired token', details: err.message });
    }
  }

  if (!user_id || !chatbot_id) {
    return res.status(400).json({ error: 'Missing user_id or chatbot_id' });
  }

  try {
    conversation_data = JSON.stringify(conversation_data);

    const result = await upsertConversation(user_id, chatbot_id, conversation_data, emne, score, customer_rating);

    res.status(201).json(result);
  } catch (err) {
    console.error('Error inserting or updating data:', err);
    res.status(500).json({ 
      error: 'Database error', 
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});


app.post('/delete', async (req, res) => {
  const { userIds } = req.body;
  if (!userIds || userIds.length === 0) {
    return res.status(400).json({ error: "userIds must be a non-empty array" });
  }

  try {
    const result = await pool.query(
      'DELETE FROM conversations WHERE user_id = ANY($1)',
      [userIds]
    );
    res.json({ message: 'Conversations deleted successfully', result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});





app.get('/conversations', authenticateToken, async (req, res) => {
  const { chatbot_id } = req.query;

  if (!chatbot_id) {
    return res.status(400).json({ error: 'chatbot_id is required' });
  }

  try {
    // Query to select all rows from the conversations table where chatbot_id matches
    const result = await pool.query(
      'SELECT * FROM conversations WHERE chatbot_id = $1',
      [chatbot_id]
    );

    // Return the result as JSON response
    res.json(result.rows);
  } catch (err) {
    // Log the error and return a 500 error response
    console.error('Error retrieving data:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

app.post('/update-conversations', async (req, res) => {
  const { chatbot_id, prediction_url } = req.body;

  if (!chatbot_id) {
    return res.status(400).json({ error: 'chatbot_id is required' });
  }

  if (!prediction_url) {
    return res.status(400).json({ error: 'prediction_url is required' });
  }

  try {
    const conversations = await pool.query('SELECT * FROM conversations WHERE chatbot_id = $1', [chatbot_id]);

    if (conversations.rows.length === 0) {
      return res.status(404).json({ error: 'No conversations found for the given chatbot_id' });
    }

    for (let conversation of conversations.rows) {
      const conversationText = conversation.conversation_data;
      const { emne, score } = await getEmneAndScore(conversationText, prediction_url);

      await pool.query(
        `UPDATE conversations SET emne = $1, score = $2 WHERE id = $3`,
        [emne, score, conversation.id]
      );
    }

    return res.status(200).json({ message: 'Conversations updated successfully' });
  } catch (error) {
    console.error('Error updating conversations:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Function to get emne and score from the provided external API
async function getEmneAndScore(conversationText, prediction_url) {
  try {
    const response = await fetch(prediction_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ question: conversationText }),
    });
    const result = await response.json();
    const text = result.text;
    const emneMatch = text.match(/Emne\(([^)]+)\)/);
    const scoreMatch = text.match(/Happy\(([^)]+)\)/);
    const emne = emneMatch ? emneMatch[1] : null;
    const score = scoreMatch ? scoreMatch[1] : null;
    return { emne, score };
  } catch (error) {
    console.error('Error getting emne and score:', error);
    return { emne: null, score: null };
  }
}



// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!', 
    details: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});