const express = require('express');
const { Pool } = require('pg');
const app = express();
const port = process.env.PORT || 5000;

// Middleware to parse JSON bodies
app.use(express.json());

// Database connection using environment variable
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false,
    },
});

// API route to save conversation
app.post('/save-conversation', async (req, res) => {
    const { conversation } = req.body;
    try {
        const query = 'INSERT INTO conversations(conversation_data) VALUES($1) RETURNING *';
        const values = [JSON.stringify(conversation)];
        const result = await pool.query(query, values);
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Error saving conversation:', error);
        res.status(500).send('Server error');
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
