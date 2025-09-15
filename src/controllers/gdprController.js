export async function getGdprSettingsController(req, res, pool) {
  try {
    const { chatbot_id } = req.params;
    const { getGdprSettingsService } = await import('../services/gdprService.js');
    const settings = await getGdprSettingsService(chatbot_id, pool);
    res.json(settings);
  } catch (error) {
    console.error('GDPR: get settings error:', error);
    res.status(500).json({ error: 'Failed to fetch GDPR settings', details: error.message });
  }
}

export async function saveGdprSettingsController(req, res, pool) {
  try {
    const { chatbot_id, retention_days, enabled } = req.body;
    if (!chatbot_id) return res.status(400).json({ error: 'chatbot_id is required' });
    if (!retention_days || retention_days < 1 || retention_days > 3650) {
      return res.status(400).json({ error: 'retention_days must be between 1 and 3650 days' });
    }
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    const { saveGdprSettingsService } = await import('../services/gdprService.js');
    const settings = await saveGdprSettingsService(chatbot_id, retention_days, enabled, pool);
    res.json({ message: 'GDPR settings saved successfully', settings });
  } catch (error) {
    console.error('GDPR: save settings error:', error);
    res.status(500).json({ error: 'Failed to save GDPR settings', details: error.message });
  }
}

export async function previewGdprCleanupController(req, res, pool) {
  try {
    const { chatbot_id } = req.params;
    const retentionDays = parseInt(req.query.retention_days, 10);
    if (!retentionDays || retentionDays < 1 || retentionDays > 3650) {
      return res.status(400).json({ error: 'retention_days query parameter must be between 1 and 3650 days' });
    }

    const { previewGdprCleanupService } = await import('../services/gdprService.js');
    const preview = await previewGdprCleanupService(chatbot_id, retentionDays, pool);
    res.json({ message: 'GDPR cleanup preview generated successfully', preview });
  } catch (error) {
    console.error('GDPR: preview error:', error);
    res.status(500).json({ error: 'Failed to generate preview', details: error.message });
  }
}

export async function executeGdprCleanupController(req, res, pool) {
  try {
    const { chatbot_id } = req.params;
    const { retention_days } = req.body;
    if (!retention_days || retention_days < 1 || retention_days > 3650) {
      return res.status(400).json({ error: 'retention_days must be between 1 and 3650 days' });
    }

    const { executeGdprCleanupService } = await import('../services/gdprService.js');
    const result = await executeGdprCleanupService(chatbot_id, retention_days, pool);
    res.json({ message: 'GDPR cleanup completed successfully', result });
  } catch (error) {
    console.error('GDPR: execute cleanup error:', error);
    res.status(500).json({ error: 'Failed to execute GDPR cleanup', details: error.message });
  }
}

export async function runGdprCleanupAllController(req, res, pool) {
  try {
    const { runGdprCleanupAllService } = await import('../services/gdprService.js');
    const results = await runGdprCleanupAllService(pool);
    res.json({ message: 'GDPR cleanup completed for all enabled clients', results });
  } catch (error) {
    console.error('GDPR: cleanup all error:', error);
    res.status(500).json({ error: 'Failed to run GDPR cleanup for all clients', details: error.message });
  }
}


