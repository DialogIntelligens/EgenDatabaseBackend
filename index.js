const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Use environment variables for sensitive information
const SECRET_KEY = process.env.SECRET_KEY || 'Megtigemaskiner00!';
const PORT = process.env.PORT || 3000;

// Initialize Express app
const app = express();

// Middleware
app.use(bodyParser.json());
app.use(cors());

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
  const { username, password, chatbot_id } = req.body;

  try {
    // Hash the password before saving
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert the new user into the database with the associated chatbot_id
    const result = await pool.query(
      'INSERT INTO users (username, password, chatbot_id) VALUES ($1, $2, $3) RETURNING *',
      [username, hashedPassword, chatbot_id]
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



async function upsertConversation(user_id, chatbot_id, conversation_data, emne, score) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Try to update first
    const updateResult = await client.query(
      `UPDATE conversations 
       SET conversation_data = $3, emne = $4, score = $5
       WHERE user_id = $1 AND chatbot_id = $2
       RETURNING *`,
      [user_id, chatbot_id, conversation_data, emne, score]
    );
    
    if (updateResult.rows.length === 0) {
      // If no row was updated, insert a new one
      const insertResult = await client.query(
        `INSERT INTO conversations (user_id, chatbot_id, conversation_data, emne, score) 
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [user_id, chatbot_id, conversation_data, emne, score]
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
  let { conversation_data, user_id, chatbot_id, emne, score } = req.body;

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

    const result = await upsertConversation(user_id, chatbot_id, conversation_data, emne, score);

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