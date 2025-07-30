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
      console.error('GET final prompt error', err);
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
      
      // Create the new section
      const newSection = { key: parseInt(section_key), content: content || '' };
      
      // Insert the section in the right position
      if (insert_after_key !== null && insert_after_key !== undefined) {
        const insertIndex = sections.findIndex(s => s.key === insert_after_key);
        if (insertIndex >= 0) {
          sections.splice(insertIndex + 1, 0, newSection);
        } else {
          sections.push(newSection);
        }
      } else {
        sections.push(newSection);
      }
      
      // Sort sections by key
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
    // Try V2 system first
    const stats = await pool.query('SELECT sections FROM prompt_templates WHERE is_system_template=TRUE LIMIT 1');
    templateSections = stats.rows[0]?.sections || [];
    
    // If no V2 template found, try V1 backward compatibility
    if (templateSections.length === 0) {
      try {
        const v1Stats = await pool.query('SELECT sections FROM statistics_prompt_template LIMIT 1');
        if (v1Stats.rows[0]?.sections) {
          // Convert V1 format to V2 format if needed
          const v1Sections = typeof v1Stats.rows[0].sections === 'string' 
            ? JSON.parse(v1Stats.rows[0].sections) 
            : v1Stats.rows[0].sections;
          templateSections = Array.isArray(v1Sections) ? v1Sections : [];
        }
      } catch (err) {
        console.log('No V1 statistics template found, using empty template');
      }
    }
  } else {
    // Try V2 system first
    const tmpl = await pool.query(
      `SELECT pt.sections
       FROM flow_template_assignments fa
       JOIN prompt_templates pt ON pt.id = fa.template_id
       WHERE fa.chatbot_id=$1 AND fa.flow_key=$2
       LIMIT 1`,
      [chatbot_id, flow_key],
    );
    templateSections = tmpl.rows[0]?.sections || [];
    
    // If no V2 assignment found, try V1 backward compatibility
    if (templateSections.length === 0) {
      try {
        const v1TableName = `${flow_key}_prompt_template`;
        const v1Template = await pool.query(`SELECT sections FROM ${v1TableName} LIMIT 1`);
        if (v1Template.rows[0]?.sections) {
          // Convert V1 format to V2 format if needed
          const v1Sections = typeof v1Template.rows[0].sections === 'string' 
            ? JSON.parse(v1Template.rows[0].sections) 
            : v1Template.rows[0].sections;
          templateSections = Array.isArray(v1Sections) ? v1Sections : [];
        }
      } catch (err) {
        console.log(`No V1 ${flow_key} template found, using empty template`);
      }
    }
  }
  
  // Ensure templateSections is in the correct format for V2
  // V2 expects array of {key: number, content: string}
  // V1 might have stored it differently
  if (templateSections.length > 0 && templateSections[0] && typeof templateSections[0].key !== 'number') {
    // If it's not in V2 format, try to convert it
    console.log('Converting template sections to V2 format');
    templateSections = templateSections.map((section, index) => ({
      key: section.key || index,
      content: section.content || section
    }));
  }
  
  const map = new Map(templateSections.map(s => [Number(s.key), s.content]));
  
  // Apply overrides
  const ovRows = await pool.query('SELECT section_key, action, content FROM prompt_overrides WHERE chatbot_id=$1 AND flow_key=$2', [chatbot_id, flow_key]);
  console.log(`Found ${ovRows.rows.length} overrides for chatbot ${chatbot_id}, flow ${flow_key}`);
  
  for (const ov of ovRows.rows) {
    const key = Number(ov.section_key);
    console.log(`Applying override: ${ov.action} for key ${key}`);
    
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
  console.log(`Final prompt has ${finalSections.length} sections`);
  
  let finalPrompt = finalSections.map(([, c]) => c.trim()).join('\n\n');
  
  // Resolve module references
  finalPrompt = await resolveModuleReferences(pool, finalPrompt);
  
  return finalPrompt;
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