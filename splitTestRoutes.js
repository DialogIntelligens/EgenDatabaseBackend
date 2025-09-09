import express from 'express';

export function registerSplitTestRoutes(app, pool, authenticateToken) {
  const router = express.Router();

  async function ensureSplitTables() {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS split_tests (
          id SERIAL PRIMARY KEY,
          chatbot_id TEXT NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          name TEXT,
          enabled BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(chatbot_id, version)
        )
      `);

      // Migration: Add version column if it doesn't exist and set default values
      try {
        await pool.query('ALTER TABLE split_tests ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1');
        await pool.query('ALTER TABLE split_tests ADD COLUMN IF NOT EXISTS name TEXT');
        await pool.query('ALTER TABLE split_tests ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()');
        
        // Update existing records without version
        await pool.query('UPDATE split_tests SET version = 1 WHERE version IS NULL');
        
        // Drop old unique constraint if it exists
        await pool.query('ALTER TABLE split_tests DROP CONSTRAINT IF EXISTS split_tests_chatbot_id_key');
        
        // Add new unique constraint if it doesn't exist
        await pool.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.table_constraints 
              WHERE constraint_name = 'split_tests_chatbot_id_version_unique'
            ) THEN
              ALTER TABLE split_tests ADD CONSTRAINT split_tests_chatbot_id_version_unique UNIQUE(chatbot_id, version);
            END IF;
          END $$;
        `);
      } catch (migrationError) {
        console.log('Migration already applied or failed:', migrationError.message);
      }
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
      await pool.query(`
        CREATE TABLE IF NOT EXISTS split_test_impressions (
          id SERIAL PRIMARY KEY,
          chatbot_id TEXT NOT NULL,
          variant_id INTEGER REFERENCES split_test_variants(id) ON DELETE CASCADE,
          visitor_key TEXT NOT NULL,
          user_id TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS split_test_assignments (
          id SERIAL PRIMARY KEY,
          chatbot_id TEXT NOT NULL,
          visitor_key TEXT NOT NULL,
          variant_id INTEGER NOT NULL REFERENCES split_test_variants(id) ON DELETE CASCADE,
          assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(chatbot_id, visitor_key)
        )
      `);
    } catch (err) {
      console.error('Error ensuring split test tables:', err);
    }
  }

  ensureSplitTables();

  // Fetch all split test versions for a chatbot
  router.get('/split-tests/:chatbot_id', authenticateToken, async (req, res) => {
    try {
      const { chatbot_id } = req.params;
      const { version } = req.query;
      
      if (version) {
        // Get specific version
        const testResult = await pool.query('SELECT id, chatbot_id, version, name, enabled, created_at, updated_at FROM split_tests WHERE chatbot_id=$1 AND version=$2', [chatbot_id, version]);
        if (testResult.rows.length === 0) {
          return res.json({ chatbot_id, version, enabled: false, variants: [] });
        }
        const splitTest = testResult.rows[0];
        const variantsResult = await pool.query(
          'SELECT id, name, percentage, config, position FROM split_test_variants WHERE split_test_id=$1 ORDER BY position, id',
          [splitTest.id]
        );
        return res.json({ 
          chatbot_id, 
          version: splitTest.version,
          name: splitTest.name,
          enabled: splitTest.enabled, 
          variants: variantsResult.rows,
          created_at: splitTest.created_at,
          updated_at: splitTest.updated_at
        });
      } else {
        // Get latest version or all versions
        const testResult = await pool.query('SELECT id, chatbot_id, version, name, enabled, created_at, updated_at FROM split_tests WHERE chatbot_id=$1 ORDER BY version DESC LIMIT 1', [chatbot_id]);
        if (testResult.rows.length === 0) {
          return res.json({ chatbot_id, enabled: false, variants: [], versions: [] });
        }
        const splitTest = testResult.rows[0];
        const variantsResult = await pool.query(
          'SELECT id, name, percentage, config, position FROM split_test_variants WHERE split_test_id=$1 ORDER BY position, id',
          [splitTest.id]
        );
        
        // Also get all versions for this chatbot
        const allVersionsResult = await pool.query(
          'SELECT version, name, enabled, created_at FROM split_tests WHERE chatbot_id=$1 ORDER BY version DESC',
          [chatbot_id]
        );
        
        return res.json({ 
          chatbot_id, 
          version: splitTest.version,
          name: splitTest.name,
          enabled: splitTest.enabled, 
          variants: variantsResult.rows,
          versions: allVersionsResult.rows,
          created_at: splitTest.created_at,
          updated_at: splitTest.updated_at
        });
      }
    } catch (err) {
      console.error('GET /split-tests error:', err);
      return res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  // Create/Update configuration
  router.post('/split-tests', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
      const { chatbot_id, enabled, variants, name, version, create_new_version } = req.body;
      if (!chatbot_id) return res.status(400).json({ error: 'chatbot_id required' });
      if (!Array.isArray(variants)) return res.status(400).json({ error: 'variants must be array' });
      const sum = variants.reduce((s, v) => s + (parseInt(v.percentage, 10) || 0), 0);
      if (sum !== 100) return res.status(400).json({ error: 'percentages must sum to 100' });

      await client.query('BEGIN');

      let splitTestId;
      let finalVersion;

      if (create_new_version) {
        // Disable all previous versions for this chatbot
        await client.query(
          'UPDATE split_tests SET enabled = FALSE WHERE chatbot_id = $1',
          [chatbot_id]
        );

        // Get next version number
        const maxVersionResult = await client.query(
          'SELECT COALESCE(MAX(version), 0) + 1 as next_version FROM split_tests WHERE chatbot_id = $1',
          [chatbot_id]
        );
        finalVersion = maxVersionResult.rows[0].next_version;

        // Create new version
        const newTestResult = await client.query(
          `INSERT INTO split_tests (chatbot_id, version, name, enabled, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())
           RETURNING id`,
          [chatbot_id, finalVersion, name || `Split Test v${finalVersion}`, !!enabled]
        );
        splitTestId = newTestResult.rows[0].id;
      } else {
        // Update existing version
        const targetVersion = version || 1;
        const upsertTest = await client.query(
          `INSERT INTO split_tests (chatbot_id, version, name, enabled, updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (chatbot_id, version)
           DO UPDATE SET name = EXCLUDED.name, enabled = EXCLUDED.enabled, updated_at = NOW()
           RETURNING id`,
          [chatbot_id, targetVersion, name || `Split Test v${targetVersion}`, !!enabled]
        );
        splitTestId = upsertTest.rows[0].id;
        finalVersion = targetVersion;
      }

      // Replace variants for this version
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
      return res.json({ success: true, id: splitTestId, version: finalVersion });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('POST /split-tests error:', err);
      return res.status(500).json({ error: 'Server error', details: err.message });
    } finally {
      client.release();
    }
  });

  // Assign a variant deterministically by percentage buckets with sticky assignment
  router.get('/split-assign', async (req, res) => {
    try {
      const { chatbot_id, visitor_key } = req.query;
      if (!chatbot_id || !visitor_key) return res.status(400).json({ error: 'chatbot_id and visitor_key required' });

      // Check for existing assignment first (sticky behavior)
      const existingAssignment = await pool.query(
        'SELECT variant_id FROM split_test_assignments WHERE chatbot_id=$1 AND visitor_key=$2',
        [chatbot_id, visitor_key]
      );

      if (existingAssignment.rows.length > 0) {
        const variantId = existingAssignment.rows[0].variant_id;
        const variantResult = await pool.query(
          'SELECT id, name, percentage, config FROM split_test_variants WHERE id=$1',
          [variantId]
        );
        if (variantResult.rows.length > 0) {
          return res.json({ enabled: true, variant_id: variantId, variant: variantResult.rows[0] });
        }
      }

      // Get the currently enabled split test (there should only be one enabled at a time)
      console.log('Looking for enabled split test for chatbot:', chatbot_id);
      const testResult = await pool.query('SELECT id, version, enabled FROM split_tests WHERE chatbot_id=$1 AND enabled=TRUE ORDER BY version DESC LIMIT 1', [chatbot_id]);
      console.log('Found enabled tests:', testResult.rows);
      if (testResult.rows.length === 0) {
        console.log('No enabled split test found');
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

      // Improved hash function for better distribution
      let hash = 0;
      const str = String(visitor_key);
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) >>> 0; // DJB2-like hash
      }
      const roll = Math.abs(hash) % 100;

      let cumulative = 0;
      let chosen = null;
      for (const v of variants) {
        cumulative += v.percentage;
        if (roll < cumulative) { chosen = v; break; }
      }

      // Store assignment for stickiness
      if (chosen) {
        try {
          await pool.query(
            `INSERT INTO split_test_assignments (chatbot_id, visitor_key, variant_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (chatbot_id, visitor_key) DO NOTHING`,
            [chatbot_id, visitor_key, chosen.id]
          );
        } catch (assignErr) {
          console.error('Error storing assignment:', assignErr);
        }
      }

      return res.json({ enabled: true, variant_id: chosen?.id || null, variant: chosen || null });
    } catch (err) {
      console.error('GET /split-assign error:', err);
      return res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  // Log impression (popup shown)
  router.post('/split-impression', async (req, res) => {
    try {
      const { chatbot_id, variant_id, visitor_key, user_id } = req.body;
      if (!chatbot_id || !variant_id || !visitor_key) {
        return res.status(400).json({ error: 'chatbot_id, variant_id, visitor_key required' });
      }

      await pool.query(
        `INSERT INTO split_test_impressions (chatbot_id, variant_id, visitor_key, user_id)
         VALUES ($1, $2, $3, $4)`,
        [chatbot_id, variant_id, visitor_key, user_id || null]
      );

      return res.json({ success: true });
    } catch (err) {
      console.error('POST /split-impression error:', err);
      return res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  // Get split test distribution analysis
  router.get('/split-test-distribution/:chatbot_id', authenticateToken, async (req, res) => {
    try {
      const { chatbot_id } = req.params;

      // Get currently enabled test
      const testResult = await pool.query('SELECT id FROM split_tests WHERE chatbot_id=$1 AND enabled=TRUE ORDER BY version DESC LIMIT 1', [chatbot_id]);
      if (testResult.rows.length === 0) {
        return res.json({ error: 'No enabled split test found' });
      }

      const splitTestId = testResult.rows[0].id;

      // Get all assignments and their hash distribution
      const assignmentsResult = await pool.query(
        'SELECT variant_id, visitor_key FROM split_test_assignments WHERE chatbot_id=$1',
        [chatbot_id]
      );

      const variantsResult = await pool.query(
        'SELECT id, name, percentage FROM split_test_variants WHERE split_test_id=$1 ORDER BY position, id',
        [splitTestId]
      );

      const variants = variantsResult.rows;
      const assignments = assignmentsResult.rows;

      // Calculate hash distribution
      const hashBuckets = {};
      const variantCounts = {};

      variants.forEach(v => {
        variantCounts[v.id] = { name: v.name, percentage: v.percentage, count: 0, hashes: [] };
      });

      assignments.forEach(assignment => {
        // Calculate hash for this visitor
        let hash = 0;
        const str = String(assignment.visitor_key);
        for (let i = 0; i < str.length; i++) {
          hash = ((hash << 5) - hash + str.charCodeAt(i)) >>> 0;
        }
        const roll = Math.abs(hash) % 100;

        // Track hash buckets
        if (!hashBuckets[roll]) hashBuckets[roll] = 0;
        hashBuckets[roll]++;

        // Track variant counts
        if (variantCounts[assignment.variant_id]) {
          variantCounts[assignment.variant_id].count++;
          variantCounts[assignment.variant_id].hashes.push(roll);
        }
      });

      const distribution = {
        total_assignments: assignments.length,
        variants: Object.values(variantCounts).map(v => ({
          name: v.name,
          expected_percentage: v.percentage,
          actual_count: v.count,
          actual_percentage: assignments.length > 0 ? ((v.count / assignments.length) * 100).toFixed(2) : 0,
          hash_range: v.hashes.length > 0 ? `${Math.min(...v.hashes)}-${Math.max(...v.hashes)}` : 'N/A'
        })),
        hash_distribution: Object.keys(hashBuckets).sort((a,b) => parseInt(a) - parseInt(b)).map(bucket => ({
          bucket: parseInt(bucket),
          count: hashBuckets[bucket]
        }))
      };

      return res.json(distribution);
    } catch (err) {
      console.error('GET /split-test-distribution error:', err);
      return res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  // Get split test statistics for comparison
  router.get('/split-test-statistics/:chatbot_id', authenticateToken, async (req, res) => {
    try {
      const { chatbot_id } = req.params;
      const { start_date, end_date, version } = req.query;

      // Get test configuration (specific version or latest)
      let testQuery, testParams;
      if (version) {
        testQuery = 'SELECT id, version, name, enabled FROM split_tests WHERE chatbot_id=$1 AND version=$2';
        testParams = [chatbot_id, version];
      } else {
        testQuery = 'SELECT id, version, name, enabled FROM split_tests WHERE chatbot_id=$1 ORDER BY version DESC LIMIT 1';
        testParams = [chatbot_id];
      }

      const testResult = await pool.query(testQuery, testParams);
      if (testResult.rows.length === 0) {
        return res.json({ enabled: false, statistics: [], versions: [] });
      }

      const splitTest = testResult.rows[0];
      const splitTestId = splitTest.id;

      // Get all versions for version selector
      const allVersionsResult = await pool.query(
        'SELECT version, name, enabled, created_at FROM split_tests WHERE chatbot_id=$1 ORDER BY version DESC',
        [chatbot_id]
      );

      // Get variants
      const variantsResult = await pool.query(
        'SELECT id, name, config FROM split_test_variants WHERE split_test_id=$1 ORDER BY position, id',
        [splitTestId]
      );

      const statistics = [];
      
      for (const variant of variantsResult.rows) {
        console.log('Processing variant:', variant);
        let dateFilter = '';
        let queryParams = [chatbot_id, variant.id];
        let paramIndex = 3;

        if (start_date && end_date) {
          dateFilter = ` AND sti.created_at BETWEEN $${paramIndex++} AND $${paramIndex++}`;
          queryParams.push(start_date, end_date);
        }

        // Get impressions (popup shows)
        const impressionsResult = await pool.query(
          `SELECT COUNT(*) as impressions FROM split_test_impressions sti 
           WHERE sti.chatbot_id = $1 AND sti.variant_id = $2${dateFilter}`,
          queryParams
        );

        // Get conversations for this variant
        const conversationsResult = await pool.query(
          `SELECT COUNT(*) as conversations, 
                  AVG(CASE WHEN customer_rating IS NOT NULL THEN customer_rating END) as avg_rating,
                  COUNT(CASE WHEN customer_rating IS NOT NULL THEN 1 END) as rating_count,
                  COUNT(CASE WHEN customer_rating >= 4 THEN 1 END) as satisfied_count
           FROM conversations c 
           WHERE c.chatbot_id = $1 AND c.split_test_id = $2${dateFilter.replace('sti.', 'c.')}`,
          queryParams
        );

        const impressions = parseInt(impressionsResult.rows[0].impressions) || 0;
        const conversations = parseInt(conversationsResult.rows[0].conversations) || 0;
        const avgRating = conversationsResult.rows[0].avg_rating || null;
        const ratingCount = parseInt(conversationsResult.rows[0].rating_count) || 0;
        const satisfiedCount = parseInt(conversationsResult.rows[0].satisfied_count) || 0;

        // Calculate usage rate (impressions -> conversations)
        const usageRate = impressions > 0 ? ((conversations / impressions) * 100).toFixed(2) : '0.00';
        console.log(`Variant ${variant.name}: impressions=${impressions}, conversations=${conversations}, usageRate=${usageRate}`);

        // Calculate CSAT
        const csat = ratingCount > 0 ? ((satisfiedCount / ratingCount) * 100).toFixed(1) : null;

        const variantData = {
          variant_id: variant.id,
          variant_name: variant.name,
          popup_text: variant.config?.popup_text || '',
          impressions,
          conversations,
          usage_rate: `${usageRate}%`,
          avg_rating: avgRating ? parseFloat(avgRating).toFixed(2) : null,
          csat: csat ? `${csat}%` : null,
          rating_count: ratingCount
        };
        console.log('Variant data:', variantData);

        statistics.push(variantData);
      }

      console.log('Final statistics response:', { enabled: splitTest.enabled, statistics, versions: allVersionsResult.rows });
      return res.json({ 
        enabled: splitTest.enabled, 
        statistics, 
        current_version: splitTest.version,
        current_name: splitTest.name,
        versions: allVersionsResult.rows 
      });
    } catch (err) {
      console.error('GET /split-test-statistics error:', err);
      return res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  app.use('/api', router);
}


