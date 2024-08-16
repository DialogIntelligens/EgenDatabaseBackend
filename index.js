const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Pool } = require('pg');

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const SECRET_KEY = 'Megtigemaskiner00!';  // Replace this with an actual secret key stored securely


// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Use body-parser middleware to parse JSON requests
app.use(bodyParser.json());

// Configure CORS
app.use(cors());

// Configure the PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// POST endpoint for user registration
app.post('/register', async (req, res) => {
  const { username, password } = req.body;

  try {
    // Hash the password before saving
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert the new user into the database
    const result = await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING *',
      [username, hashedPassword]
    );

    res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    console.error('Error registering user:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// POST endpoint for user login
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

    res.json({ token });
  } catch (err) {
    console.error('Error logging in:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});



// POST endpoint to save a new conversation
app.post('/conversations', async (req, res) => {
  console.log('Received request body:', req.body);  // Log the received data
  
  // Destructure conversation_data and user_id from the request body
  let { conversation_data, user_id } = req.body;

  try {
    // Convert conversation_data to JSON string (only if your table stores JSONB type)
    conversation_data = JSON.stringify(conversation_data);

    // Insert user_id and conversation_data into the conversations table
    const result = await pool.query(
      'INSERT INTO conversations (user_id, conversation_data) VALUES ($1, $2) RETURNING *',
      [user_id, conversation_data]
    );

    // Return the inserted row as JSON response
    res.status(201).json(result.rows[0]);
  } catch (err) {
    // Log the error and return a 500 error response
    console.error('Error inserting data:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// GET endpoint to retrieve all conversations
app.get('/conversations', async (req, res) => {
  try {
    // Query to select all rows from the conversations table
    const result = await pool.query('SELECT * FROM conversations');

    // Return the result as JSON response
    res.json(result.rows);
  } catch (err) {
    // Log the error and return a 500 error response
    console.error('Error retrieving data:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
