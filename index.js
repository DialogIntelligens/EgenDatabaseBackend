const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Pool } = require('pg');

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
