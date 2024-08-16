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

app.post('/conversations', async (req, res) => {
  console.log('Received request body:', req.body);  // Log the received data
  let { conversation_data, user_id } = req.body;    // Make sure to destructure user_id

  try {
    // Convert conversation_data to JSON string
    conversation_data = JSON.stringify(conversation_data);

    const result = await pool.query(
      'INSERT INTO conversations (user_id, conversation_data) VALUES ($1, $2) RETURNING *',
      [user_id, conversation_data]  // Add user_id to the query
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error inserting data:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});




// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
