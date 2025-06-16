import express from 'express';

/**
 * Registers prompt template & override routes under /prompt-template
 * @param {import('express').Express} app  Express app instance
 * @param {import('pg').Pool} pool        pg pool
 * @param {Function} authenticateToken    JWT middleware from index.js
 */
export function registerPromptTemplateRoutes(app, pool, authenticateToken) {
  const router = express.Router();

  // Valid flow types
  const VALID_FLOW_TYPES = [
    'statistics', 'main', 'flow2', 'flow3', 'flow4', 'apiflow', 'metadata',
    'main_rephrase', 'flow2_rephrase', 'flow3_rephrase', 'flow4_rephrase', 'apiflow_rephrase', 'metadata_rephrase'
  ];

  /* =============================
     MASTER TEMPLATE ROUTES
  ============================= */

  // GET /prompt-template/:flow_type -> current template for a flow type
  router.get('/:flow_type', async (req, res) => {
    const { flow_type } = req.params;
    
    if (!VALID_FLOW_TYPES.includes(flow_type)) {
      return res.status(400).json({ error: 'Invalid flow type. Valid types: ' + VALID_FLOW_TYPES.join(', ') });
    }

    try {
      console.log(`GET /prompt-template/${flow_type} called`);
      const tableName = `${flow_type}_prompt_template`;
      const { rows } = await pool.query(`SELECT * FROM ${tableName} LIMIT 1`);
      console.log(`Template query result for ${flow_type}:`, rows.length, 'rows found');
      
      if (rows.length > 0) {
        console.log(`Template data for ${flow_type}:`, {
          id: rows[0].id,
          version: rows[0].version,
          sectionsType: typeof rows[0].sections,
          sectionsLength: Array.isArray(rows[0].sections) ? rows[0].sections.length : 'not array'
        });
      }
      
      res.json(rows[0] || null);
    } catch (err) {
      console.error(`GET /prompt-template/${flow_type} error:`, err);
      console.error('Error details:', {
        message: err.message,
        stack: err.stack,
        code: err.code
      });
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  // Backward compatibility: GET /prompt-template -> statistics template (legacy route)
  router.get('/', async (req, res) => {
    try {
      console.log('GET /prompt-template called (legacy route - redirecting to statistics)');
      const { rows } = await pool.query('SELECT * FROM statistics_prompt_template LIMIT 1');
      console.log('Template query result:', rows.length, 'rows found');
      
      if (rows.length > 0) {
        console.log('Template data:', {
          id: rows[0].id,
          version: rows[0].version,
          sectionsType: typeof rows[0].sections,
          sectionsLength: Array.isArray(rows[0].sections) ? rows[0].sections.length : 'not array'
        });
      }
      
      res.json(rows[0] || null);
    } catch (err) {
      console.error('GET /prompt-template error:', err);
      console.error('Error details:', {
        message: err.message,
        stack: err.stack,
        code: err.code
      });
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  // PUT /prompt-template/:flow_type (admin only) -> overwrite template, bump version & archive previous row
  router.put('/:flow_type', authenticateToken, async (req, res) => {
    const { flow_type } = req.params;
    
    if (!VALID_FLOW_TYPES.includes(flow_type)) {
      return res.status(400).json({ error: 'Invalid flow type. Valid types: ' + VALID_FLOW_TYPES.join(', ') });
    }

    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Admins only' });
    }

    const { sections } = req.body; // expecting array of { key:int, content:string }
    if (!Array.isArray(sections)) {
      return res.status(400).json({ error: 'sections must be an array' });
    }

    // Validate sections structure
    for (const section of sections) {
      if (!section.hasOwnProperty('key') || !section.hasOwnProperty('content')) {
        return res.status(400).json({ error: 'Each section must have key and content properties' });
      }
      if (typeof section.key !== 'number' || typeof section.content !== 'string') {
        return res.status(400).json({ error: 'Section key must be number and content must be string' });
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      console.log(`Starting template update transaction for ${flow_type}`);

      const tableName = `${flow_type}_prompt_template`;
      const historyTableName = `${flow_type}_prompt_template_history`;

      // Move current template (if any) to history table
      const cur = await client.query(`SELECT * FROM ${tableName} LIMIT 1`);
      console.log(`Current ${flow_type} template rows found:`, cur.rows.length);
      
      let newVersion = 1;
      if (cur.rows.length > 0) {
        const currentTemplate = cur.rows[0];
        newVersion = (currentTemplate.version || 0) + 1;
        
        // Only insert to history if we have a valid user ID
        const modifiedBy = req.user?.userId || null;
        console.log(`Archiving ${flow_type} template version`, currentTemplate.version, 'modified by user', modifiedBy);
        
        await client.query(
          `INSERT INTO ${historyTableName}
             (version, sections, updated_at, modified_by)
           VALUES ($1,$2,$3,$4)`,
          [
            currentTemplate.version,
            JSON.stringify(currentTemplate.sections), // stringify to valid JSON
            currentTemplate.updated_at,
            modifiedBy,
          ],
        );
        console.log(`Successfully archived current ${flow_type} template`);
      }

      // Delete current template
      await client.query(`DELETE FROM ${tableName}`);
      console.log(`Deleted current ${flow_type} template`);
      
      // Insert new template (single-row table pattern)
      console.log(`Inserting new ${flow_type} template version`, newVersion, 'with sections:', sections);
      await client.query(
        `INSERT INTO ${tableName} (version, sections, updated_at)
         VALUES ($1,$2,NOW())`,
        [newVersion, JSON.stringify(sections)], // Convert to JSON string for storage
      );
      console.log(`Successfully inserted new ${flow_type} template`);

      await client.query('COMMIT');
      console.log('Transaction committed successfully');
      
      res.json({ message: 'template updated', version: newVersion, flow_type });
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(`PUT /prompt-template/${flow_type} error:`, e);
      console.error('Error details:', {
        message: e.message,
        stack: e.stack,
        code: e.code
      });
      res.status(500).json({ error: 'Server error', details: e.message });
    } finally {
      client.release();
    }
  });

  // Backward compatibility: PUT /prompt-template -> statistics template (legacy route)
  router.put('/', authenticateToken, async (req, res) => {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Admins only' });
    }

    const { sections } = req.body; // expecting array of { key:int, content:string }
    if (!Array.isArray(sections)) {
      return res.status(400).json({ error: 'sections must be an array' });
    }

    // Validate sections structure
    for (const section of sections) {
      if (!section.hasOwnProperty('key') || !section.hasOwnProperty('content')) {
        return res.status(400).json({ error: 'Each section must have key and content properties' });
      }
      if (typeof section.key !== 'number' || typeof section.content !== 'string') {
        return res.status(400).json({ error: 'Section key must be number and content must be string' });
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      console.log('Starting template update transaction for statistics (legacy)');

      // Move current template (if any) to history table
      const cur = await client.query('SELECT * FROM statistics_prompt_template LIMIT 1');
      console.log('Current template rows found:', cur.rows.length);
      
      let newVersion = 1;
      if (cur.rows.length > 0) {
        const currentTemplate = cur.rows[0];
        newVersion = (currentTemplate.version || 0) + 1;
        
        // Only insert to history if we have a valid user ID
        const modifiedBy = req.user?.userId || null;
        console.log('Archiving template version', currentTemplate.version, 'modified by user', modifiedBy);
        
        await client.query(
          `INSERT INTO statistics_prompt_template_history
             (version, sections, updated_at, modified_by)
           VALUES ($1,$2,$3,$4)`,
          [
            currentTemplate.version,
            JSON.stringify(currentTemplate.sections), // stringify to valid JSON
            currentTemplate.updated_at,
            modifiedBy,
          ],
        );
        console.log('Successfully archived current template');
      }

      // Delete current template
      await client.query('DELETE FROM statistics_prompt_template');
      console.log('Deleted current template');
      
      // Insert new template (single-row table pattern)
      console.log('Inserting new template version', newVersion, 'with sections:', sections);
      await client.query(
        `INSERT INTO statistics_prompt_template (version, sections, updated_at)
         VALUES ($1,$2,NOW())`,
        [newVersion, JSON.stringify(sections)], // Convert to JSON string for storage
      );
      console.log('Successfully inserted new template');

      await client.query('COMMIT');
      console.log('Transaction committed successfully');
      
      res.json({ message: 'template updated', version: newVersion });
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('PUT /prompt-template error:', e);
      console.error('Error details:', {
        message: e.message,
        stack: e.stack,
        code: e.code
      });
      res.status(500).json({ error: 'Server error', details: e.message });
    } finally {
      client.release();
    }
  });

  /* =============================
     OVERRIDES ROUTES
  ============================= */

  // GET /prompt-template/:flow_type/overrides/:chatbot_id -> list overrides for a chatbot and flow type
  router.get('/:flow_type/overrides/:chatbot_id', async (req, res) => {
    const { flow_type, chatbot_id } = req.params;
    
    if (!VALID_FLOW_TYPES.includes(flow_type)) {
      return res.status(400).json({ error: 'Invalid flow type. Valid types: ' + VALID_FLOW_TYPES.join(', ') });
    }

    try {
      const tableName = `${flow_type}_prompt_overrides`;
      const { rows } = await pool.query(
        `SELECT * FROM ${tableName} WHERE chatbot_id=$1 ORDER BY section_key`,
        [chatbot_id],
      );
      res.json(rows);
    } catch (err) {
      console.error(`GET ${flow_type} overrides error:`, err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  // Backward compatibility: GET /prompt-template/overrides/:chatbot_id -> statistics overrides (legacy route)
  router.get('/overrides/:chatbot_id', async (req, res) => {
    const { chatbot_id } = req.params;
    try {
      const { rows } = await pool.query(
        'SELECT * FROM statistics_prompt_overrides WHERE chatbot_id=$1 ORDER BY section_key',
        [chatbot_id],
      );
      res.json(rows);
    } catch (err) {
      console.error('GET overrides error:', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  // POST /prompt-template/:flow_type/overrides -> add/update override for specific flow type
  router.post('/:flow_type/overrides', authenticateToken, async (req, res) => {
    const { flow_type } = req.params;
    const { chatbot_id, section_key, action, content } = req.body;
    
    if (!VALID_FLOW_TYPES.includes(flow_type)) {
      return res.status(400).json({ error: 'Invalid flow type. Valid types: ' + VALID_FLOW_TYPES.join(', ') });
    }
    
    if (!chatbot_id || !section_key || !action) {
      return res.status(400).json({ error: 'chatbot_id, section_key and action are required' });
    }

    if (!['add', 'modify', 'remove'].includes(action)) {
      return res.status(400).json({ error: 'action must be add|modify|remove' });
    }

    try {
      const tableName = `${flow_type}_prompt_overrides`;
      await pool.query(
        `INSERT INTO ${tableName} (chatbot_id, section_key, action, content, updated_at)
         VALUES ($1,$2,$3,$4,NOW())
         ON CONFLICT (chatbot_id, section_key)
         DO UPDATE SET action=$3, content=$4, updated_at=NOW()`,
        [chatbot_id, section_key, action, content || null],
      );
      res.json({ message: 'saved', flow_type });
    } catch (err) {
      console.error(`POST ${flow_type} overrides error:`, err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  // Backward compatibility: POST /prompt-template/overrides -> statistics overrides (legacy route)
  router.post('/overrides', authenticateToken, async (req, res) => {
    const { chatbot_id, section_key, action, content } = req.body;
    if (!chatbot_id || !section_key || !action) {
      return res.status(400).json({ error: 'chatbot_id, section_key and action are required' });
    }

    if (!['add', 'modify', 'remove'].includes(action)) {
      return res.status(400).json({ error: 'action must be add|modify|remove' });
    }

    try {
      await pool.query(
        `INSERT INTO statistics_prompt_overrides (chatbot_id, section_key, action, content, updated_at)
         VALUES ($1,$2,$3,$4,NOW())
         ON CONFLICT (chatbot_id, section_key)
         DO UPDATE SET action=$3, content=$4, updated_at=NOW()`,
        [chatbot_id, section_key, action, content || null],
      );
      res.json({ message: 'saved' });
    } catch (err) {
      console.error('POST overrides error:', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  // DELETE /prompt-template/:flow_type/overrides/:id
  router.delete('/:flow_type/overrides/:id', authenticateToken, async (req, res) => {
    const { flow_type, id } = req.params;
    
    if (!VALID_FLOW_TYPES.includes(flow_type)) {
      return res.status(400).json({ error: 'Invalid flow type. Valid types: ' + VALID_FLOW_TYPES.join(', ') });
    }

    try {
      const tableName = `${flow_type}_prompt_overrides`;
      await pool.query(`DELETE FROM ${tableName} WHERE id=$1`, [id]);
      res.json({ message: 'deleted', flow_type });
    } catch (err) {
      console.error(`DELETE ${flow_type} override error:`, err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  // Backward compatibility: DELETE /prompt-template/overrides/:id -> statistics overrides (legacy route)
  router.delete('/overrides/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
      await pool.query('DELETE FROM statistics_prompt_overrides WHERE id=$1', [id]);
      res.json({ message: 'deleted' });
    } catch (err) {
      console.error('DELETE override error:', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  // GET /prompt-template/:flow_type/final/:chatbot_id -> final prompt for chatbot and flow type
  router.get('/:flow_type/final/:chatbot_id', async (req, res) => {
    const { flow_type, chatbot_id } = req.params;
    
    if (!VALID_FLOW_TYPES.includes(flow_type)) {
      return res.status(400).json({ error: 'Invalid flow type. Valid types: ' + VALID_FLOW_TYPES.join(', ') });
    }

    try {
      const prompt = await buildPromptForFlow(pool, flow_type, chatbot_id);
      res.json({ prompt, flow_type });
    } catch (err) {
      console.error(`GET /prompt-template/${flow_type}/final error:`, err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  // Backward compatibility: GET /prompt-template/final/:chatbot_id -> statistics final prompt (legacy route)
  router.get('/final/:chatbot_id', async (req, res) => {
    try {
      const prompt = await buildPromptForFlow(pool, 'statistics', req.params.chatbot_id);
      res.json({ prompt });
    } catch (err) {
      console.error('GET /prompt-template/final error:', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  app.use('/prompt-template', router);
}

/* =====================================================
   Helper: build final prompt for a chatbot and flow type by applying
   overrides onto the master template. Returns string.
===================================================== */
export async function buildPromptForFlow(pool, flow_type, chatbot_id) {
  // 1) fetch master template
  const templateTable = `${flow_type}_prompt_template`;
  const tmplRows = await pool.query(`SELECT sections FROM ${templateTable} LIMIT 1`);
  const templateSections = tmplRows.rows[0]?.sections || [];

  // templateSections should be array of {key:int, content:string}
  const map = new Map(templateSections.map((s) => [s.key, s.content]));

  // 2) apply overrides
  const overrideTable = `${flow_type}_prompt_overrides`;
  const ovRows = await pool.query(
    `SELECT section_key, action, content FROM ${overrideTable} WHERE chatbot_id=$1`,
    [chatbot_id],
  );

  for (const ov of ovRows.rows) {
    if (ov.action === 'remove') {
      map.delete(ov.section_key);
    } else if (ov.action === 'modify') {
      map.set(ov.section_key, ov.content);
    } else if (ov.action === 'add') {
      map.set(ov.section_key, ov.content); // add new section (unique key)
    }
  }

  // 3) sort by section_key and join
  const finalPrompt = [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, content]) => content.trim())
    .join('\n\n');

  return finalPrompt;
}

// Backward compatibility function
export async function buildStatestikPrompt(pool, chatbot_id) {
  return buildPromptForFlow(pool, 'statistics', chatbot_id);
} 