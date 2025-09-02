import express from 'express';

export function registerSplitTestRoutes(app, pool, authenticateToken) {
  const router = express.Router();

  async function ensureSplitTables() {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS split_tests (
          id SERIAL PRIMARY KEY,
          chatbot_id TEXT UNIQUE NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT FALSE,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS split_test_variants (
          id SERIAL PRIMARY KEY,
          split_test_id INTEGER NOT NULL REFERENCES split_tests(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          percentage INTEGER NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
          config JSONB NOT NULL DEFAULT '{}'::jsonb,
          position INTEGER NOT NULL DEFAULT 0
        )
      `);
    } catch (err) {
      console.error('Error ensuring split test tables:', err);
    }
  }

  ensureSplitTables();

  // Fetch configuration for a chatbot
  router.get('/split-tests/:chatbot_id', authenticateToken, async (req, res) => {
    try {
      const { chatbot_id } = req.params;
      const testResult = await pool.query('SELECT id, chatbot_id, enabled, updated_at FROM split_tests WHERE chatbot_id=$1', [chatbot_id]);
      if (testResult.rows.length === 0) {
        return res.json({ chatbot_id, enabled: false, variants: [] });
      }
      const splitTest = testResult.rows[0];
      const variantsResult = await pool.query(
        'SELECT id, name, percentage, config, position FROM split_test_variants WHERE split_test_id=$1 ORDER BY position, id',
        [splitTest.id]
      );
      return res.json({ chatbot_id, enabled: splitTest.enabled, variants: variantsResult.rows });
    } catch (err) {
      console.error('GET /split-tests error:', err);
      return res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  // Create/Update configuration
  router.post('/split-tests', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
      const { chatbot_id, enabled, variants } = req.body;
      if (!chatbot_id) return res.status(400).json({ error: 'chatbot_id required' });
      if (!Array.isArray(variants)) return res.status(400).json({ error: 'variants must be array' });
      const sum = variants.reduce((s, v) => s + (parseInt(v.percentage, 10) || 0), 0);
      if (sum !== 100) return res.status(400).json({ error: 'percentages must sum to 100' });

      await client.query('BEGIN');

      const upsertTest = await client.query(
        `INSERT INTO split_tests (chatbot_id, enabled, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (chatbot_id)
         DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()
         RETURNING id`,
        [chatbot_id, !!enabled]
      );
      const splitTestId = upsertTest.rows[0].id;

      // Replace variants for simplicity
      await client.query('DELETE FROM split_test_variants WHERE split_test_id=$1', [splitTestId]);
      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];
        await client.query(
          `INSERT INTO split_test_variants (split_test_id, name, percentage, config, position)
           VALUES ($1, $2, $3, $4, $5)`,
          [splitTestId, v.name || `Variant ${i + 1}`, parseInt(v.percentage, 10) || 0, JSON.stringify(v.config || {}), i]
        );
      }

      await client.query('COMMIT');
      return res.json({ success: true, id: splitTestId });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('POST /split-tests error:', err);
      return res.status(500).json({ error: 'Server error', details: err.message });
    } finally {
      client.release();
    }
  });

  // Assign a variant deterministically by percentage buckets
  router.get('/split-assign', async (req, res) => {
    try {
      const { chatbot_id, visitor_key } = req.query;
      if (!chatbot_id || !visitor_key) return res.status(400).json({ error: 'chatbot_id and visitor_key required' });

      const testResult = await pool.query('SELECT id, enabled FROM split_tests WHERE chatbot_id=$1', [chatbot_id]);
      if (testResult.rows.length === 0 || !testResult.rows[0].enabled) {
        return res.json({ enabled: false, variant_id: null });
      }
      const splitTestId = testResult.rows[0].id;
      const variantsResult = await pool.query(
        'SELECT id, name, percentage, config FROM split_test_variants WHERE split_test_id=$1 ORDER BY position, id',
        [splitTestId]
      );
      const variants = variantsResult.rows;
      const total = variants.reduce((s, v) => s + v.percentage, 0);
      if (total !== 100 || variants.length === 0) {
        return res.json({ enabled: false, variant_id: null });
      }

      // Simple hash to 0..99
      let hash = 0;
      const str = String(visitor_key);
      for (let i = 0; i < str.length; i++) {
        hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
      }
      const roll = hash % 100;

      let cumulative = 0;
      let chosen = null;
      for (const v of variants) {
        cumulative += v.percentage;
        if (roll < cumulative) { chosen = v; break; }
      }

      return res.json({ enabled: true, variant_id: chosen?.id || null, variant: chosen || null });
    } catch (err) {
      console.error('GET /split-assign error:', err);
      return res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  app.use('/', router);
}


