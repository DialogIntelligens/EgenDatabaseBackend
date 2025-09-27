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
        'SELECT id, name, description, version, is_system_template, created_by, created_at, updated_at, type FROM prompt_templates ORDER BY id DESC',
      );
      res.json(rows);
    } catch (err) {
      console.error('GET templates error', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  router.post('/templates', authenticateToken, async (req, res) => {
    if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admins only' });
    const { name, description, sections, type } = req.body;
    if (!name || !Array.isArray(sections)) return res.status(400).json({ error: 'name and sections array required' });
    const templateType = type || 'template'; // Default to 'template' if not specified
    try {
      const { rows } = await pool.query(
        `INSERT INTO prompt_templates (name, description, sections, created_by, type)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id, version`,
        [name, description || null, JSON.stringify(sections), req.user.userId, templateType],
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
    const { name, description, sections, type } = req.body;
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
        `UPDATE prompt_templates SET name=$1, description=$2, sections=$3, version=$4, type=$5, updated_at=NOW()
          WHERE id=$6`,
        [
          name || current.name, 
          description || current.description, 
          JSON.stringify(sections), 
          newVersion, 
          type || current.type || 'template',
          id
        ],
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
     TOPK SETTINGS
  ============================= */
  router.get('/topk/:chatbot_id', async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM flow_topk_settings WHERE chatbot_id=$1 ORDER BY flow_key', [req.params.chatbot_id]);
      res.json(rows);
    } catch (err) {
      console.error('GET topk settings error', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  router.post('/topk', authenticateToken, async (req, res) => {
    const { chatbot_id, flow_key, top_k } = req.body;
    if (!chatbot_id || !flow_key || top_k === undefined) return res.status(400).json({ error: 'chatbot_id, flow_key, top_k required' });
    
    // Validate top_k is a positive integer
    const topKValue = parseInt(top_k);
    if (isNaN(topKValue) || topKValue < 1) return res.status(400).json({ error: 'top_k must be a positive integer' });
    
    try {
      await pool.query(
        `INSERT INTO flow_topk_settings (chatbot_id, flow_key, top_k)
         VALUES ($1,$2,$3)
         ON CONFLICT (chatbot_id, flow_key) DO UPDATE SET top_k=$3, updated_at=NOW()`,
        [chatbot_id, flow_key, topKValue],
      );
      res.json({ message: 'topk setting saved' });
    } catch (err) {
      console.error('POST topk settings error', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  router.delete('/topk/:chatbot_id/:flow_key', authenticateToken, async (req, res) => {
    try {
      await pool.query('DELETE FROM flow_topk_settings WHERE chatbot_id=$1 AND flow_key=$2', [req.params.chatbot_id, req.params.flow_key]);
      res.json({ message: 'topk setting deleted' });
    } catch (err) {
      console.error('DELETE topk setting error', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  /* =============================
     CHATBOT SETTINGS
  ============================= */
  router.get('/chatbot-settings/:chatbot_id', async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM chatbot_settings WHERE chatbot_id=$1', [req.params.chatbot_id]);
      if (rows.length === 0) {
        return res.status(404).json({ error: 'No settings found for this chatbot' });
      }
      res.json(rows[0]);
    } catch (err) {
      console.error('GET chatbot settings error', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  router.post('/chatbot-settings', authenticateToken, async (req, res) => {
    const { 
      chatbot_id, 
      image_enabled, 
      camera_button_enabled,
      // Flow configuration fields
      flow2_key,
      flow3_key,
      flow4_key,
      apiflow_key,
      metadata_key,
      metadata2_key,
      // Knowledgebase indexes
      knowledgebase_index_endpoint,
      flow2_knowledgebase_index,
      flow3_knowledgebase_index,
      flow4_knowledgebase_index,
      apiflow_knowledgebase_index,
      // Pinecone API key
      pinecone_api_key,
      // First message
      first_message
    } = req.body;
    
    if (!chatbot_id) return res.status(400).json({ error: 'chatbot_id required' });

    // Validate boolean fields if provided
    if (image_enabled !== undefined && typeof image_enabled !== 'boolean') {
      return res.status(400).json({ error: 'image_enabled must be a boolean' });
    }
    if (camera_button_enabled !== undefined && typeof camera_button_enabled !== 'boolean') {
      return res.status(400).json({ error: 'camera_button_enabled must be a boolean' });
    }

    try {
      await pool.query(
        `INSERT INTO chatbot_settings (
          chatbot_id, 
          image_enabled, 
          camera_button_enabled,
          flow2_key,
          flow3_key,
          flow4_key,
          apiflow_key,
          metadata_key,
          metadata2_key,
          knowledgebase_index_endpoint,
          flow2_knowledgebase_index,
          flow3_knowledgebase_index,
          flow4_knowledgebase_index,
          apiflow_knowledgebase_index,
          pinecone_api_key,
          first_message,
          updated_at
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP)
         ON CONFLICT (chatbot_id)
         DO UPDATE SET
           image_enabled = COALESCE($2, chatbot_settings.image_enabled),
           camera_button_enabled = COALESCE($3, chatbot_settings.camera_button_enabled),
           flow2_key = COALESCE($4, chatbot_settings.flow2_key),
           flow3_key = COALESCE($5, chatbot_settings.flow3_key),
           flow4_key = COALESCE($6, chatbot_settings.flow4_key),
           apiflow_key = COALESCE($7, chatbot_settings.apiflow_key),
           metadata_key = COALESCE($8, chatbot_settings.metadata_key),
           metadata2_key = COALESCE($9, chatbot_settings.metadata2_key),
           knowledgebase_index_endpoint = COALESCE($10, chatbot_settings.knowledgebase_index_endpoint),
           flow2_knowledgebase_index = COALESCE($11, chatbot_settings.flow2_knowledgebase_index),
           flow3_knowledgebase_index = COALESCE($12, chatbot_settings.flow3_knowledgebase_index),
           flow4_knowledgebase_index = COALESCE($13, chatbot_settings.flow4_knowledgebase_index),
           apiflow_knowledgebase_index = COALESCE($14, chatbot_settings.apiflow_knowledgebase_index),
           pinecone_api_key = COALESCE($15, chatbot_settings.pinecone_api_key),
           first_message = COALESCE($16, chatbot_settings.first_message),
           updated_at = CURRENT_TIMESTAMP`,
        [
          chatbot_id, 
          image_enabled, 
          camera_button_enabled,
          flow2_key,
          flow3_key,
          flow4_key,
          apiflow_key,
          metadata_key,
          metadata2_key,
          knowledgebase_index_endpoint,
          flow2_knowledgebase_index,
          flow3_knowledgebase_index,
          flow4_knowledgebase_index,
          apiflow_knowledgebase_index,
          pinecone_api_key,
          first_message
        ]
      );
      res.json({ success: true, message: 'Chatbot settings saved successfully' });
    } catch (err) {
      console.error('POST chatbot settings error', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  /* =============================
     CHATBOT LANGUAGE SETTINGS
  ============================= */
  router.get('/language/:chatbot_id', async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM chatbot_language_settings WHERE chatbot_id=$1', [req.params.chatbot_id]);
      if (rows.length === 0) {
        return res.status(404).json({ error: 'No language setting found for this chatbot' });
      }
      res.json(rows[0]);
    } catch (err) {
      console.error('GET language setting error', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  router.post('/language', authenticateToken, async (req, res) => {
    const { chatbot_id, language } = req.body;
    if (!chatbot_id || !language) return res.status(400).json({ error: 'chatbot_id and language required' });
    
    // Validate language value
    const supportedLanguages = ['danish', 'english', 'swedish', 'norwegian', 'german', 'dutch', 'french', 'italian', 'finnish'];
    if (!supportedLanguages.includes(language)) {
      return res.status(400).json({ error: `language must be one of: ${supportedLanguages.join(', ')}` });
    }
    
    try {
      await pool.query(
        `INSERT INTO chatbot_language_settings (chatbot_id, language, updated_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (chatbot_id) 
         DO UPDATE SET language = $2, updated_at = CURRENT_TIMESTAMP`,
        [chatbot_id, language]
      );
      res.json({ success: true, message: 'Language setting saved successfully' });
    } catch (err) {
      console.error('POST language setting error', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  /* =============================
     FLOW PINECONE API KEYS
  ============================= */
  router.get('/flow-api-keys/:chatbot_id', async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM flow_pinecone_api_keys WHERE chatbot_id=$1 ORDER BY flow_key', [req.params.chatbot_id]);
      res.json(rows);
    } catch (err) {
      console.error('GET flow API keys error', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  router.post('/flow-api-keys', authenticateToken, async (req, res) => {
    const { chatbot_id, flow_key, pinecone_api_key } = req.body;
    if (!chatbot_id || !flow_key || !pinecone_api_key) return res.status(400).json({ error: 'chatbot_id, flow_key, pinecone_api_key required' });
    
    try {
      await pool.query(
        `INSERT INTO flow_pinecone_api_keys (chatbot_id, flow_key, pinecone_api_key)
         VALUES ($1,$2,$3)
         ON CONFLICT (chatbot_id, flow_key) DO UPDATE SET pinecone_api_key=$3, updated_at=NOW()`,
        [chatbot_id, flow_key, pinecone_api_key],
      );
      res.json({ message: 'flow API key saved' });
    } catch (err) {
      console.error('POST flow API key error', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  router.delete('/flow-api-keys/:chatbot_id/:flow_key', authenticateToken, async (req, res) => {
    try {
      await pool.query('DELETE FROM flow_pinecone_api_keys WHERE chatbot_id=$1 AND flow_key=$2', [req.params.chatbot_id, req.params.flow_key]);
      res.json({ message: 'flow API key deleted' });
    } catch (err) {
      console.error('DELETE flow API key error', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });



  /* =============================
     OVERRIDES
  ============================= */
  router.get('/overrides/:chatbot_id/:flow_key', async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM prompt_overrides WHERE chatbot_id=$1 AND flow_key=$2 ORDER BY section_key', [req.params.chatbot_id, req.params.flow_key]);
      
      // Parse module metadata from stored content
      const processedRows = rows.map(row => {
        try {
          // Try to parse as JSON to check if it contains module metadata
          const parsed = JSON.parse(row.content);
          if (parsed.isModuleSection) {
            return {
              ...row,
              content: parsed.content,
              isModuleSection: parsed.isModuleSection,
              moduleId: parsed.moduleId,
              moduleName: parsed.moduleName,
              originalModuleSectionKey: parsed.originalModuleSectionKey,
              parentSectionKey: parsed.parentSectionKey
            };
          }
        } catch (e) {
          // Not JSON or doesn't contain module metadata, treat as regular content
        }
        return row;
      });
      
      res.json(processedRows);
    } catch (err) {
      console.error('GET overrides error', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  router.post('/overrides', authenticateToken, async (req, res) => {
    const { chatbot_id, flow_key, section_key, action, content, isModuleSection, moduleId, moduleName, originalModuleSectionKey, parentSectionKey } = req.body;
    if (!chatbot_id || !flow_key || !section_key || !action) return res.status(400).json({ error: 'chatbot_id, flow_key, section_key, action required' });
    if (!['add', 'modify', 'remove'].includes(action)) return res.status(400).json({ error: 'invalid action' });
    try {
      // Store module metadata as JSON in the content field alongside the actual content
      let contentData = content;
      if (isModuleSection) {
        contentData = JSON.stringify({
          content: content,
          isModuleSection: true,
          moduleId: moduleId,
          moduleName: moduleName,
          originalModuleSectionKey: originalModuleSectionKey,
          parentSectionKey: parentSectionKey
        });
      }
      
      await pool.query(
        `INSERT INTO prompt_overrides (chatbot_id, flow_key, section_key, action, content, updated_at)
         VALUES ($1,$2,$3,$4,$5,NOW())
         ON CONFLICT (chatbot_id, flow_key, section_key)
         DO UPDATE SET action=$4, content=$5, updated_at=NOW()`,
        [chatbot_id, flow_key, section_key, action, contentData],
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
      // Check if this is an empty template error
      if (err.message.includes('No template content available') || err.message.includes('Template content is empty')) {
        return res.status(400).json({ 
          error: 'Template configuration error', 
          details: err.message,
          flow_key: req.params.flow_key 
        });
      }
      
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  /* =============================
     ADD SECTION TO NEW PROMPTS ONLY
  ============================= */
  router.post('/add-section-new-only', authenticateToken, async (req, res) => {
    if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admins only' });
    
    const { template_id, section_key, content, insert_after_key } = req.body;
    if (!template_id || section_key === undefined) {
      return res.status(400).json({ error: 'template_id and section_key required' });
    }
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Get current template
      const templateResult = await client.query('SELECT * FROM prompt_templates WHERE id=$1', [template_id]);
      if (!templateResult.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Template not found' });
      }
      
      const template = templateResult.rows[0];
      let sections = template.sections || [];
      
      // Insert the section in the right position and calculate the appropriate key
      let newSection;
      if (insert_after_key !== null && insert_after_key !== undefined) {
        const insertIndex = sections.findIndex(s => s.key === insert_after_key);
        if (insertIndex >= 0) {
          // Calculate the key based on the insertion position
          const prevSection = sections[insertIndex];
          const nextSection = sections[insertIndex + 1];

          let calculatedKey;
          if (nextSection) {
            // Insert between two sections
            const gap = nextSection.key - prevSection.key;
            if (gap >= 3) {
              calculatedKey = prevSection.key + 1;
            } else if (gap === 2) {
              calculatedKey = prevSection.key + 1;
            } else {
              calculatedKey = prevSection.key * 10 + 5;
            }

            // Ensure the key is unique
            while (sections.some(s => s.key === calculatedKey)) {
              calculatedKey += 1;
            }
          } else {
            // Insert at the end
            calculatedKey = prevSection.key + 1;
          }

          newSection = { key: calculatedKey, content: content || '' };
          sections.splice(insertIndex + 1, 0, newSection);
        } else {
          // insert_after_key not found, add to end with provided key or default
          newSection = { key: parseInt(section_key) || 1000, content: content || '' };
          sections.push(newSection);
        }
      } else {
        // No insert_after_key provided, add to end
        newSection = { key: parseInt(section_key), content: content || '' };
        sections.push(newSection);
      }

      // Sort sections by key to ensure proper ordering
      sections.sort((a, b) => a.key - b.key);
      
      // Update template with new section
      const newVersion = (template.version || 0) + 1;
      await client.query(
        `INSERT INTO prompt_template_history (template_id, version, sections, updated_at, modified_by)
         VALUES ($1,$2,$3,$4,$5)`,
        [template_id, template.version, JSON.stringify(template.sections), template.updated_at, req.user.userId],
      );
      
      await client.query(
        `UPDATE prompt_templates SET sections=$1, version=$2, updated_at=NOW() WHERE id=$3`,
        [JSON.stringify(sections), newVersion, template_id],
      );
      
      // Find all existing assignments for this template
      const assignmentsResult = await client.query(
        'SELECT chatbot_id, flow_key FROM flow_template_assignments WHERE template_id=$1',
        [template_id]
      );
      
      // Create remove overrides for all existing assignments
      for (const assignment of assignmentsResult.rows) {
        await client.query(
          `INSERT INTO prompt_overrides (chatbot_id, flow_key, section_key, action, content, updated_at)
           VALUES ($1,$2,$3,$4,$5,NOW())
           ON CONFLICT (chatbot_id, flow_key, section_key)
           DO UPDATE SET action=$4, content=$5, updated_at=NOW()`,
          [assignment.chatbot_id, assignment.flow_key, section_key, 'remove', ''],
        );
      }
      
      await client.query('COMMIT');
      
      res.json({ 
        message: 'Section added to template with remove overrides for existing assignments',
        affected_assignments: assignmentsResult.rows.length,
        version: newVersion 
      });
      
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Add section new-only error', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    } finally {
      client.release();
    }
  });

  /* =============================
     MODULES
  ============================= */
  router.get('/modules', async (_req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT id, name, description, version, sections, created_by, created_at, updated_at FROM prompt_templates WHERE type=$1 ORDER BY name',
        ['module']
      );
      res.json(rows);
    } catch (err) {
      console.error('GET modules error', err);
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
  } else if (flow_key === 'image') {
    // For image flow, check if there's a template assignment, otherwise use default
    const tmpl = await pool.query(
      `SELECT pt.sections
       FROM flow_template_assignments fa
       JOIN prompt_templates pt ON pt.id = fa.template_id
       WHERE fa.chatbot_id=$1 AND fa.flow_key=$2
       LIMIT 1`,
      [chatbot_id, flow_key],
    );
    templateSections = tmpl.rows[0]?.sections || [];
    
    // If no template assigned for image flow, use a default image analysis prompt
    if (templateSections.length === 0) {
      templateSections = [{
        key: 1,
        content: "You are an AI assistant that analyzes images and provides detailed descriptions. When a user uploads an image, describe what you see in detail, including objects, people, text, colors, and any other relevant information. Be specific and helpful in your description."
      }];
    }
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
  
  // Ensure templateSections is in the correct V2 format
  // V2 expects array of {key: number, content: string}
  if (templateSections.length > 0 && templateSections[0] && typeof templateSections[0].key !== 'number') {
    console.log('Converting template sections to V2 format');
    templateSections = templateSections.map((section, index) => ({
      key: section.key || index,
      content: section.content || section
    }));
  }
  
  const map = new Map(templateSections.map(s => [Number(s.key), s.content]));
  
  // Apply overrides
  const ovRows = await pool.query('SELECT section_key, action, content FROM prompt_overrides WHERE chatbot_id=$1 AND flow_key=$2', [chatbot_id, flow_key]);
  
  for (const ov of ovRows.rows) {
    const key = Number(ov.section_key);
    
    let contentToUse = ov.content;
    
    // Check if this is module section data stored as JSON
    try {
      const parsed = JSON.parse(ov.content);
      if (parsed.isModuleSection) {
        contentToUse = parsed.content;
        console.log(`Processing module section from ${parsed.moduleName}`);
      }
    } catch (e) {
      // Not JSON, use content as-is
    }
    
    if (ov.action === 'remove') {
      map.delete(key);
    } else if (ov.action === 'modify') {
      map.set(key, contentToUse);
    } else if (ov.action === 'add') {
      map.set(key, contentToUse);
    }
  }
  
  const finalSections = [...map.entries()].sort((a, b) => a[0] - b[0]);
  
  // Check if we have any content after applying overrides
  if (finalSections.length === 0) {
    throw new Error(`No template content available for flow '${flow_key}'. Please configure a template for this chatbot and flow.`);
  }
  
  let finalPrompt = finalSections.map(([, c]) => c.trim()).join('\n\n').trim();
  
  // Additional check for empty content after joining and trimming
  if (!finalPrompt || finalPrompt.length === 0) {
    throw new Error(`Template content is empty for flow '${flow_key}'. Please configure proper template content for this flow.`);
  }
  
  // Resolve module references
  finalPrompt = await resolveModuleReferences(pool, finalPrompt);
  
  // Add current date and time information at the beginning of the prompt
  const now = new Date();
  const options = { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Copenhagen' // Danish timezone
  };
  const dateTimeString = now.toLocaleDateString('en-US', options);
  const timeString = now.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit', 
    hour12: false,
    timeZone: 'Europe/Copenhagen'
  });
  
  const dateTimeInfo = `It is currently ${dateTimeString.split(',')[0].toLowerCase()} the ${now.getDate()}${getOrdinalSuffix(now.getDate())} of ${now.toLocaleDateString('en-US', { month: 'long', timeZone: 'Europe/Copenhagen' }).toLowerCase()} ${timeString}`;
  
  // Append date/time info to the prompt if there's content
  if (finalPrompt.trim()) {
    finalPrompt = `${finalPrompt}\n\n${dateTimeInfo}`;
  }
  
  return finalPrompt;
}

/* Helper to get ordinal suffix for day numbers */
function getOrdinalSuffix(day) {
  if (day > 3 && day < 21) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

/* Helper to resolve module references in prompt text */
async function resolveModuleReferences(pool, promptText) {
  // Find all module references in the format {{module:id:name}}
  const moduleRegex = /\{\{module:(\d+):([^}]+)\}\}/g;
  let match;
  const moduleReferences = [];
  
  while ((match = moduleRegex.exec(promptText)) !== null) {
    moduleReferences.push({
      fullMatch: match[0],
      moduleId: parseInt(match[1]),
      moduleName: match[2]
    });
  }
  
  if (moduleReferences.length === 0) {
    return promptText;
  }
  
  // Fetch all referenced modules
  const moduleIds = [...new Set(moduleReferences.map(ref => ref.moduleId))];
  const moduleQuery = 'SELECT id, sections FROM prompt_templates WHERE id = ANY($1) AND type = $2';
  const { rows: modules } = await pool.query(moduleQuery, [moduleIds, 'module']);
  
  // Create a map of module ID to content
  const moduleContentMap = {};
  modules.forEach(module => {
    if (module.sections && Array.isArray(module.sections)) {
      // Join all sections of the module
      const moduleContent = module.sections
        .sort((a, b) => a.key - b.key)
        .map(section => section.content.trim())
        .filter(content => content.length > 0)
        .join('\n\n');
      moduleContentMap[module.id] = moduleContent;
    }
  });
  
  // Replace module references with actual content
  let resolvedPrompt = promptText;
  for (const ref of moduleReferences) {
    const moduleContent = moduleContentMap[ref.moduleId];
    if (moduleContent) {
      resolvedPrompt = resolvedPrompt.replace(ref.fullMatch, moduleContent);
      console.log(`Resolved module reference: ${ref.moduleName} (ID: ${ref.moduleId})`);
    } else {
      console.warn(`Module not found: ${ref.moduleName} (ID: ${ref.moduleId})`);
      // Leave the reference as-is if module not found
    }
  }
  
  return resolvedPrompt;
} 