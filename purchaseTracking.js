import express from 'express';
import pg from 'pg';

const { Pool } = pg;

// PostgreSQL pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

const router = express.Router();

/**
 * Record a purchase event
 * This endpoint is called by the integration script when a purchase or cart event occurs
 */
router.post('/track-purchase', async (req, res) => {
  try {
    const {
      user_id,
      chatbot_id,
      event_type, // 'add_to_cart', 'checkout_started', or 'purchase_complete'
      amount,
      currency_code = 'DKK',
      product_count,
      metadata = {}
    } = req.body;

    console.log('Purchase tracking request received:', {
      user_id,
      chatbot_id,
      event_type,
      amount,
      currency_code,
      product_count,
      metadata
    });

    // Validate required fields
    if (!user_id || !chatbot_id || !event_type || amount === undefined) {
      console.error('Missing required fields:', { user_id, chatbot_id, event_type, amount });
      return res.status(400).json({ 
        error: 'Missing required fields: user_id, chatbot_id, event_type, and amount are required' 
      });
    }

    // Start a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Find the most recent conversation for this user and chatbot
      const conversationResult = await client.query(
        `SELECT id FROM conversations 
         WHERE user_id = $1 AND chatbot_id = $2 
         ORDER BY created_at DESC 
         LIMIT 1`,
        [user_id, chatbot_id]
      );

      if (conversationResult.rows.length === 0) {
        await client.query('ROLLBACK');
        console.error('No conversation found for user:', user_id, 'chatbot:', chatbot_id);
        return res.status(404).json({ 
          error: 'No conversation found for this user and chatbot' 
        });
      }

      const conversationId = conversationResult.rows[0].id;
      console.log('Found conversation ID:', conversationId);

      // Insert the purchase event
      await client.query(
        `INSERT INTO purchase_events 
         (conversation_id, user_id, chatbot_id, event_type, amount, currency_code, product_count, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [conversationId, user_id, chatbot_id, event_type, amount, currency_code, product_count, metadata]
      );

      console.log('Purchase event inserted');

      // Update the conversation based on event type
      if (event_type === 'purchase_complete') {
        await client.query(
          `UPDATE conversations 
           SET has_purchase = TRUE,
               purchase_amount = $1,
               currency_code = $2,
               purchase_timestamp = NOW(),
               tracking_enabled = TRUE
           WHERE id = $3`,
          [amount, currency_code, conversationId]
        );
        console.log('Conversation updated for purchase_complete');
      } else if (event_type === 'add_to_cart' || event_type === 'checkout_started') {
        // Update cart amount (could be multiple add to cart events)
        await client.query(
          `UPDATE conversations 
           SET cart_amount = COALESCE(cart_amount, 0) + $1,
               currency_code = $2,
               tracking_enabled = TRUE
           WHERE id = $3`,
          [amount, currency_code, conversationId]
        );
        console.log(`Conversation updated for ${event_type}`);
      }

      await client.query('COMMIT');

      console.log('Purchase event tracked successfully');
      res.json({ 
        success: true, 
        message: 'Purchase event tracked successfully',
        conversation_id: conversationId,
        event_type: event_type,
        amount: amount
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Error tracking purchase:', error);
    res.status(500).json({ 
      error: 'Failed to track purchase event', 
      details: error.message 
    });
  }
});

/**
 * Get purchase statistics for a chatbot
 */
router.get('/purchase-stats/:chatbot_id', async (req, res) => {
  try {
    const { chatbot_id } = req.params;
    const { start_date, end_date } = req.query;

    let queryParams = [chatbot_id];
    let dateFilter = '';
    
    if (start_date && end_date) {
      dateFilter = ' AND c.created_at BETWEEN $2 AND $3';
      queryParams.push(start_date, end_date);
    }

    // Get overall stats
    const statsResult = await pool.query(
      `SELECT 
         COUNT(DISTINCT c.id) as total_conversations,
         COUNT(DISTINCT CASE WHEN c.has_purchase THEN c.id END) as conversations_with_purchase,
         COUNT(DISTINCT CASE WHEN c.cart_amount > 0 THEN c.id END) as conversations_with_cart,
         SUM(c.purchase_amount) as total_purchase_amount,
         SUM(c.cart_amount) as total_cart_amount,
         AVG(CASE WHEN c.has_purchase THEN c.purchase_amount END) as avg_purchase_amount,
         AVG(CASE WHEN c.cart_amount > 0 THEN c.cart_amount END) as avg_cart_amount
       FROM conversations c
       WHERE c.chatbot_id = $1 AND c.tracking_enabled = TRUE${dateFilter}`,
      queryParams
    );

    // Get conversion rate
    const stats = statsResult.rows[0];
    const conversionRate = stats.total_conversations > 0 
      ? (stats.conversations_with_purchase / stats.total_conversations * 100).toFixed(2)
      : 0;

    res.json({
      total_conversations: parseInt(stats.total_conversations) || 0,
      conversations_with_purchase: parseInt(stats.conversations_with_purchase) || 0,
      conversations_with_cart: parseInt(stats.conversations_with_cart) || 0,
      conversion_rate: parseFloat(conversionRate),
      total_purchase_amount: parseFloat(stats.total_purchase_amount) || 0,
      total_cart_amount: parseFloat(stats.total_cart_amount) || 0,
      avg_purchase_amount: parseFloat(stats.avg_purchase_amount) || 0,
      avg_cart_amount: parseFloat(stats.avg_cart_amount) || 0
    });

  } catch (error) {
    console.error('Error fetching purchase stats:', error);
    res.status(500).json({ 
      error: 'Failed to fetch purchase statistics', 
      details: error.message 
    });
  }
});

/**
 * Get detailed purchase events for a conversation
 */
router.get('/purchase-events/:conversation_id', async (req, res) => {
  try {
    const { conversation_id } = req.params;

    const result = await pool.query(
      `SELECT * FROM purchase_events 
       WHERE conversation_id = $1 
       ORDER BY created_at ASC`,
      [conversation_id]
    );

    res.json(result.rows);

  } catch (error) {
    console.error('Error fetching purchase events:', error);
    res.status(500).json({ 
      error: 'Failed to fetch purchase events', 
      details: error.message 
    });
  }
});

export default router; 