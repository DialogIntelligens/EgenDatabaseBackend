import express from 'express';

// Mapping of prompt types to their database table names
const PROMPT_TYPES = {
  statestik: {
    template: 'statestik_prompt_template',
    history: 'statestik_prompt_template_history', 
    overrides: 'statestik_prompt_overrides'
  },
  fordelingsflow: {
    template: 'fordelingsflow_prompt_template',
    history: 'fordelingsflow_prompt_template_history',
    overrides: 'fordelingsflow_prompt_overrides'
  },
  api_endpoint: {
    template: 'api_endpoint_prompt_template', 
    history: 'api_endpoint_prompt_template_history',
    overrides: 'api_endpoint_prompt_overrides'
  },
  flow3: {
    template: 'flow3_prompt_template',
    history: 'flow3_prompt_template_history', 
    overrides: 'flow3_prompt_overrides'
  }
};

/**
 * Validates if a prompt type is supported
 * @param {string} promptType - The prompt type to validate
 * @returns {boolean} True if valid, false otherwise
 */
function isValidPromptType(promptType) {
  return PROMPT_TYPES.hasOwnProperty(promptType);
}

/**
 * Gets table names for a specific prompt type
 * @param {string} promptType - The prompt type
 * @returns {object} Object containing template, history, and overrides table names
 */
function getTableNames(promptType) {
  if (!isValidPromptType(promptType)) {
    throw new Error(`Invalid prompt type: ${promptType}`);
  }
  return PROMPT_TYPES[promptType];
}

/**
 * Registers prompt template & override routes for all prompt types
 * @param {import('express').Express} app  Express app instance
 * @param {import('pg').Pool} pool        pg pool
 * @param {Function} authenticateToken    JWT middleware from index.js
 */
export function registerPromptTemplateRoutes(app, pool, authenticateToken) {
  const router = express.Router();

  /* =============================
     MASTER TEMPLATE ROUTES
  ============================= */

  // GET /prompt-template/:promptType -> current template (single row)
  router.get('/:promptType', async (req, res) => {
    const { promptType } = req.params;
    
    if (!isValidPromptType(promptType)) {
      return res.status(400).json({ error: `Invalid prompt type: ${promptType}` });
    }
    
    try {
      console.log(`GET /prompt-template/${promptType} called`);
      const tables = getTableNames(promptType);
      const { rows } = await pool.query(`SELECT * FROM ${tables.template} LIMIT 1`);
      console.log(`${promptType} template query result:`, rows.length, 'rows found');
      
      if (rows.length > 0) {
        console.log(`${promptType} template data:`, {
          id: rows[0].id,
          version: rows[0].version,
          sectionsType: typeof rows[0].sections,
          sectionsLength: Array.isArray(rows[0].sections) ? rows[0].sections.length : 'not array'
        });
      }
      
      res.json(rows[0] || null);
    } catch (err) {
      console.error(`GET /prompt-template/${promptType} error:`, err);
      console.error('Error details:', {
        message: err.message,
        stack: err.stack,
        code: err.code
      });
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  // PUT /prompt-template/:promptType  (admin only) -> overwrite template, bump version & archive previous row
  router.put('/:promptType', authenticateToken, async (req, res) => {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Admins only' });
    }

    const { promptType } = req.params;
    
    if (!isValidPromptType(promptType)) {
      return res.status(400).json({ error: `Invalid prompt type: ${promptType}` });
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
      console.log(`Starting ${promptType} template update transaction`);

      const tables = getTableNames(promptType);

      // Move current template (if any) to history table
      const cur = await client.query(`SELECT * FROM ${tables.template} LIMIT 1`);
      console.log(`Current ${promptType} template rows found:`, cur.rows.length);
      
      let newVersion = 1;
      if (cur.rows.length > 0) {
        const currentTemplate = cur.rows[0];
        newVersion = (currentTemplate.version || 0) + 1;
        
        // Only insert to history if we have a valid user ID
        const modifiedBy = req.user?.userId || null;
        console.log(`Archiving ${promptType} template version`, currentTemplate.version, 'modified by user', modifiedBy);
        
        await client.query(
          `INSERT INTO ${tables.history}
             (version, sections, updated_at, modified_by)
           VALUES ($1,$2,$3,$4)`,
          [
            currentTemplate.version,
            JSON.stringify(currentTemplate.sections), // stringify to valid JSON
            currentTemplate.updated_at,
            modifiedBy,
          ],
        );
        console.log(`Successfully archived current ${promptType} template`);
      }

      // Delete current template
      await client.query(`DELETE FROM ${tables.template}`);
      console.log(`Deleted current ${promptType} template`);
      
      // Insert new template (single-row table pattern)
      console.log(`Inserting new ${promptType} template version`, newVersion, 'with sections:', sections);
      await client.query(
        `INSERT INTO ${tables.template} (version, sections, updated_at)
         VALUES ($1,$2,NOW())`,
        [newVersion, JSON.stringify(sections)], // Convert to JSON string for storage
      );
      console.log(`Successfully inserted new ${promptType} template`);

      await client.query('COMMIT');
      console.log(`${promptType} template transaction committed successfully`);
      
      res.json({ message: 'template updated', version: newVersion });
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(`PUT /prompt-template/${promptType} error:`, e);
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

  // GET /prompt-template/:promptType/overrides/:chatbot_id -> list overrides for a chatbot
  router.get('/:promptType/overrides/:chatbot_id', async (req, res) => {
    const { promptType, chatbot_id } = req.params;
    
    if (!isValidPromptType(promptType)) {
      return res.status(400).json({ error: `Invalid prompt type: ${promptType}` });
    }
    
    try {
      const tables = getTableNames(promptType);
      const { rows } = await pool.query(
        `SELECT * FROM ${tables.overrides} WHERE chatbot_id=$1 ORDER BY section_key`,
        [chatbot_id],
      );
      res.json(rows);
    } catch (err) {
      console.error(`GET ${promptType} overrides error:`, err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  // POST /prompt-template/:promptType/overrides  -> add/update override
  router.post('/:promptType/overrides', authenticateToken, async (req, res) => {
    const { promptType } = req.params;
    const { chatbot_id, section_key, action, content } = req.body;
    
    if (!isValidPromptType(promptType)) {
      return res.status(400).json({ error: `Invalid prompt type: ${promptType}` });
    }
    
    if (!chatbot_id || !section_key || !action) {
      return res.status(400).json({ error: 'chatbot_id, section_key and action are required' });
    }

    if (!['add', 'modify', 'remove'].includes(action)) {
      return res.status(400).json({ error: 'action must be add|modify|remove' });
    }

    try {
      const tables = getTableNames(promptType);
      await pool.query(
        `INSERT INTO ${tables.overrides} (chatbot_id, section_key, action, content, updated_at)
         VALUES ($1,$2,$3,$4,NOW())
         ON CONFLICT (chatbot_id, section_key)
         DO UPDATE SET action=$3, content=$4, updated_at=NOW()`,
        [chatbot_id, section_key, action, content || null],
      );
      res.json({ message: 'saved' });
    } catch (err) {
      console.error(`POST ${promptType} overrides error:`, err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  // DELETE /prompt-template/:promptType/overrides/:id
  router.delete('/:promptType/overrides/:id', authenticateToken, async (req, res) => {
    const { promptType, id } = req.params;
    
    if (!isValidPromptType(promptType)) {
      return res.status(400).json({ error: `Invalid prompt type: ${promptType}` });
    }
    
    try {
      const tables = getTableNames(promptType);
      await pool.query(`DELETE FROM ${tables.overrides} WHERE id=$1`, [id]);
      res.json({ message: 'deleted' });
    } catch (err) {
      console.error(`DELETE ${promptType} override error:`, err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  // GET /prompt-template/:promptType/final/:chatbot_id -> build final prompt for chatbot
  router.get('/:promptType/final/:chatbot_id', async (req, res) => {
    const { promptType, chatbot_id } = req.params;
    
    if (!isValidPromptType(promptType)) {
      return res.status(400).json({ error: `Invalid prompt type: ${promptType}` });
    }
    
    try {
      const prompt = await buildPrompt(pool, promptType, chatbot_id);
      res.json({ prompt });
    } catch (err) {
      console.error(`GET /prompt-template/${promptType}/final error:`, err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  app.use('/prompt-template', router);
}

/* =====================================================
   Helper: build final prompt for a chatbot by applying
   overrides onto the master template.  Returns string.
===================================================== */
export async function buildPrompt(pool, promptType, chatbot_id) {
  if (!isValidPromptType(promptType)) {
    throw new Error(`Invalid prompt type: ${promptType}`);
  }
  
  const tables = getTableNames(promptType);
  
  // 1) fetch master template
  const tmplRows = await pool.query(`SELECT sections FROM ${tables.template} LIMIT 1`);
  const templateSections = tmplRows.rows[0]?.sections || [];

  // templateSections should be array of {key:int, content:string}
  const map = new Map(templateSections.map((s) => [s.key, s.content]));

  // 2) apply overrides
  const ovRows = await pool.query(
    `SELECT section_key, action, content FROM ${tables.overrides} WHERE chatbot_id=$1`,
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

// Backward compatibility function for existing buildStatestikPrompt calls
export async function buildStatestikPrompt(pool, chatbot_id) {
  return buildPrompt(pool, 'statestik', chatbot_id);
} 