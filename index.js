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
  let { conversation_data } = req.body;

  try {
    // Convert conversation_data to JSON string
    conversation_data = JSON.stringify(conversation_data);

    const result = await pool.query(
      'INSERT INTO conversations (conversation_data) VALUES ($1) RETURNING *',
      [conversation_data]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error inserting data:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// GET endpoint to retrieve all conversations
app.get('/conversations', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM conversations');
    res.json(result.rows);
  } catch (err) {
    console.error('Error retrieving data:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
