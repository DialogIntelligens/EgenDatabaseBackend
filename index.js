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

// POST route to add a new conversation
app.post('/conversations', async (req, res) => {
  const { conversation_data } = req.body;

  try {
    const result = await pool.query(
      'INSERT INTO conversations (conversation_data) VALUES ($1) RETURNING *',
      [conversation_data]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
