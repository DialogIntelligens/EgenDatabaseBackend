import express from 'express';

export function registerPopupMessageRoutes(app, pool, authenticateToken) {
  const router = express.Router();

  async function ensurePopupSettingsTable() {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS chatbot_popup_settings (
          id SERIAL PRIMARY KEY,
          chatbot_id TEXT UNIQUE NOT NULL,
          popup_text TEXT,
          settings JSONB DEFAULT '{}'::jsonb,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
    } catch (err) {
      console.error('Error ensuring chatbot_popup_settings table:', err);
    }
  }

  ensurePopupSettingsTable();

  // GET /popup-message?chatbot_id=...&visitor_key=...&variant_id=...  → returns { popup_text }
  router.get('/popup-message', async (req, res) => {
    try {
      const { chatbot_id, visitor_key, variant_id } = req.query;
      if (!chatbot_id) return res.status(400).json({ error: 'chatbot_id required' });

      // Priority 1: If variant_id is provided, use that variant's popup text
      if (variant_id) {
        const variantResult = await pool.query(
          'SELECT config FROM split_test_variants WHERE id = $1',
          [variant_id]
        );
        if (variantResult.rows.length > 0) {
          const config = variantResult.rows[0].config || {};
          const popup_text = config.popup_text || null;
          return res.json({ popup_text });
        }
      }

      // Priority 2: Check if there's an active split test and get assignment
      if (visitor_key) {
        const assignmentResult = await pool.query(
          `SELECT stv.config 
           FROM split_test_assignments sta
           JOIN split_test_variants stv ON sta.variant_id = stv.id
           JOIN split_tests st ON stv.split_test_id = st.id
           WHERE sta.chatbot_id = $1 AND sta.visitor_key = $2 AND st.enabled = true`,
          [chatbot_id, visitor_key]
        );
        if (assignmentResult.rows.length > 0) {
          const config = assignmentResult.rows[0].config || {};
          const popup_text = config.popup_text || null;
          return res.json({ popup_text });
        }
      }

      // Priority 3: Default popup from chatbot_popup_settings
      const { rows } = await pool.query(
        'SELECT popup_text FROM chatbot_popup_settings WHERE chatbot_id = $1',
        [chatbot_id]
      );

      const popup_text = rows[0]?.popup_text || null;
      return res.json({ popup_text });
    } catch (err) {
      console.error('GET /popup-message error:', err);
      return res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  // PUT /popup-message { chatbot_id, popup_text }
  router.put('/popup-message', authenticateToken, async (req, res) => {
    try {
      const { chatbot_id, popup_text } = req.body;
      if (!chatbot_id) return res.status(400).json({ error: 'chatbot_id required' });

      await pool.query(
        `INSERT INTO chatbot_popup_settings (chatbot_id, popup_text, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (chatbot_id)
         DO UPDATE SET popup_text = EXCLUDED.popup_text, updated_at = NOW()`,
        [chatbot_id, popup_text || null]
      );

      return res.json({ success: true });
    } catch (err) {
      console.error('PUT /popup-message error:', err);
      return res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  app.use('/', router);
}