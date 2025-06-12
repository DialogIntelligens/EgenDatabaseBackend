import express from 'express';

/**
 * Registers V2 prompt template routes under /prompt-template
 * Implements a generic template system.
 */
export function registerPromptTemplateV2Routes(app, pool, authenticateToken) {
  const router = express.Router();

  /* =============================
     TEMPLATE CRUD ROUTES
  ============================= */
  router.get('/templates', async (_req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT id, name, description, version, is_system_template, created_by, created_at, updated_at FROM prompt_templates ORDER BY id DESC',
      );
      res.json(rows);
    } catch (err) {
      console.error('GET templates error', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  router.post('/templates', authenticateToken, async (req, res) => {
    if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admins only' });
    const { name, description, sections } = req.body;
    if (!name || !Array.isArray(sections)) return res.status(400).json({ error: 'name and sections array required' });
    try {
      const { rows } = await pool.query(
        `INSERT INTO prompt_templates (name, description, sections, created_by)
         VALUES ($1,$2,$3,$4)
         RETURNING id, version`,
        [name, description || null, JSON.stringify(sections), req.user.userId],
      );
      res.json({ id: rows[0].id, version: rows[0].version });
    } catch (err) {
      console.error('POST templates error', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  router.get('/templates/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const { rows } = await pool.query('SELECT * FROM prompt_templates WHERE id=$1', [id]);
      if (!rows.length) return res.status(404).json({ error: 'Template not found' });
      res.json(rows[0]);
    } catch (err) {
      console.error('GET template error', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  router.put('/templates/:id', authenticateToken, async (req, res) => {
    if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admins only' });
    const { id } = req.params;
    const { name, description, sections } = req.body;
    if (!Array.isArray(sections)) return res.status(400).json({ error: 'sections must be array' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const cur = await client.query('SELECT * FROM prompt_templates WHERE id=$1', [id]);
      if (!cur.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Template not found' });
      }
      const current = cur.rows[0];
      const newVersion = (current.version || 0) + 1;
      await client.query(
        `INSERT INTO prompt_template_history (template_id, version, sections, updated_at, modified_by)
         VALUES ($1,$2,$3,$4,$5)`,
        [id, current.version, JSON.stringify(current.sections), current.updated_at, req.user.userId],
      );
      await client.query(
        `UPDATE prompt_templates SET name=$1, description=$2, sections=$3, version=$4, updated_at=NOW()
          WHERE id=$5`,
        [name || current.name, description || current.description, JSON.stringify(sections), newVersion, id],
      );
      await client.query('COMMIT');
      res.json({ message: 'template updated', version: newVersion });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('PUT template error', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    } finally {
      client.release();
    }
  });

  router.delete('/templates/:id', authenticateToken, async (req, res) => {
    if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admins only' });
    try {
      await pool.query('DELETE FROM prompt_templates WHERE id=$1', [req.params.id]);
      res.json({ message: 'deleted' });
    } catch (err) {
      console.error('DELETE template error', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  /* =============================
     ASSIGNMENTS
  ============================= */
  router.get('/assignments/:chatbot_id', async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM flow_template_assignments WHERE chatbot_id=$1 ORDER BY flow_key', [req.params.chatbot_id]);
      res.json(rows);
    } catch (err) {
      console.error('GET assignments error', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  router.post('/assignments', authenticateToken, async (req, res) => {
    const { chatbot_id, flow_key, template_id } = req.body;
    if (!chatbot_id || !flow_key || !template_id) return res.status(400).json({ error: 'chatbot_id, flow_key, template_id required' });
    try {
      await pool.query(
        `INSERT INTO flow_template_assignments (chatbot_id, flow_key, template_id)
         VALUES ($1,$2,$3)
         ON CONFLICT (chatbot_id, flow_key) DO UPDATE SET template_id=$3, updated_at=NOW()`,
        [chatbot_id, flow_key, template_id],
      );
      res.json({ message: 'assigned' });
    } catch (err) {
      console.error('POST assignments error', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  router.delete('/assignments/:chatbot_id/:flow_key', authenticateToken, async (req, res) => {
    try {
      await pool.query('DELETE FROM flow_template_assignments WHERE chatbot_id=$1 AND flow_key=$2', [req.params.chatbot_id, req.params.flow_key]);
      res.json({ message: 'deleted' });
    } catch (err) {
      console.error('DELETE assignment error', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  /* =============================
     OVERRIDES
  ============================= */
  router.get('/overrides/:chatbot_id/:flow_key', async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM prompt_overrides WHERE chatbot_id=$1 AND flow_key=$2 ORDER BY section_key', [req.params.chatbot_id, req.params.flow_key]);
      res.json(rows);
    } catch (err) {
      console.error('GET overrides error', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  router.post('/overrides', authenticateToken, async (req, res) => {
    const { chatbot_id, flow_key, section_key, action, content } = req.body;
    if (!chatbot_id || !flow_key || !section_key || !action) return res.status(400).json({ error: 'chatbot_id, flow_key, section_key, action required' });
    if (!['add', 'modify', 'remove'].includes(action)) return res.status(400).json({ error: 'invalid action' });
    try {
      await pool.query(
        `INSERT INTO prompt_overrides (chatbot_id, flow_key, section_key, action, content, updated_at)
         VALUES ($1,$2,$3,$4,$5,NOW())
         ON CONFLICT (chatbot_id, flow_key, section_key)
         DO UPDATE SET action=$4, content=$5, updated_at=NOW()`,
        [chatbot_id, flow_key, section_key, action, content || null],
      );
      res.json({ message: 'saved' });
    } catch (err) {
      console.error('POST overrides error', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  router.delete('/overrides/:id', authenticateToken, async (req, res) => {
    try {
      await pool.query('DELETE FROM prompt_overrides WHERE id=$1', [req.params.id]);
      res.json({ message: 'deleted' });
    } catch (err) {
      console.error('DELETE override error', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  /* =============================
     FINAL PROMPT
  ============================= */
  router.get('/final/:chatbot_id/:flow_key', async (req, res) => {
    try {
      const prompt = await buildPrompt(pool, req.params.chatbot_id, req.params.flow_key);
      res.json({ prompt, flow_key: req.params.flow_key });
    } catch (err) {
      console.error('GET final prompt error', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  /* =============================
     SYSTEM STATISTICS TEMPLATE
  ============================= */
  router.get('/statistics-template', async (_req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM prompt_templates WHERE is_system_template=TRUE LIMIT 1');
      if (!rows.length) return res.status(404).json({ error: 'Statistics template not found' });
      res.json(rows[0]);
    } catch (err) {
      console.error('GET statistics template error', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  app.use('/prompt-template', router);
}

/* Helper to build final prompt */
export async function buildPrompt(pool, chatbot_id, flow_key) {
  let templateSections = [];
  if (flow_key === 'statistics') {
    const stats = await pool.query('SELECT sections FROM prompt_templates WHERE is_system_template=TRUE LIMIT 1');
    templateSections = stats.rows[0]?.sections || [];
  } else {
    const tmpl = await pool.query(
      `SELECT pt.sections
       FROM flow_template_assignments fa
       JOIN prompt_templates pt ON pt.id = fa.template_id
       WHERE fa.chatbot_id=$1 AND fa.flow_key=$2
       LIMIT 1`,
      [chatbot_id, flow_key],
    );
    templateSections = tmpl.rows[0]?.sections || [];
  }
  const map = new Map(templateSections.map(s => [Number(s.key), s.content]));
  const ovRows = await pool.query('SELECT section_key, action, content FROM prompt_overrides WHERE chatbot_id=$1 AND flow_key=$2', [chatbot_id, flow_key]);
  for (const ov of ovRows.rows) {
    const key = Number(ov.section_key);
    if (ov.action === 'remove') map.delete(key);
    else if (ov.action === 'modify') map.set(key, ov.content);
    else if (ov.action === 'add') map.set(key, ov.content);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => c.trim()).join('\n\n');
} 