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

// Middleware to verify JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) return res.sendStatus(401); // If no token, return 401 Unauthorized

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.sendStatus(403); // If token is invalid or expired, return 403 Forbidden
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



app.post('/conversations', authenticateToken, async (req, res) => {
  console.log('Received request body:', req.body); // Log the received data

  // Destructure conversation_data, user_id, and chatbot_id from the request body
  let { conversation_data, user_id, chatbot_id } = req.body;

  try {
    // Convert conversation_data to JSON string (only if your table stores JSONB type)
    conversation_data = JSON.stringify(conversation_data);

    // Insert user_id, chatbot_id, and conversation_data into the conversations table
    const result = await pool.query(
      'INSERT INTO conversations (user_id, chatbot_id, conversation_data) VALUES ($1, $2, $3) RETURNING *',
      [user_id, chatbot_id, conversation_data]
    );

    // Return the inserted row as JSON response
    res.status(201).json(result.rows[0]);
  } catch (err) {
    // Log the error and return a 500 error response
    console.error('Error inserting data:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
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


// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
