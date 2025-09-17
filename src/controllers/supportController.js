import { getSupportStatusByChatbotService, updateSupportStatusService, getMySupportStatusService } from '../services/supportService.js';
import { validateSupportStatusPayload } from '../utils/supportUtils.js';

export async function getSupportStatusController(req, res, pool) {
  const { chatbot_id } = req.params;
  if (!chatbot_id) return res.status(400).json({ error: 'chatbot_id is required' });
  try {
    const result = await getSupportStatusByChatbotService(chatbot_id, pool);
    return res.json(result);
  } catch (err) {
    console.error('Error fetching support status:', err);
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}

export async function updateSupportStatusController(req, res, pool) {
  const user_id = req.user?.userId;
  const { chatbot_id, is_live } = req.body;

  const validation = validateSupportStatusPayload({ chatbot_id, is_live });
  if (validation) return res.status(400).json({ error: validation });

  try {
    const data = await updateSupportStatusService({ user_id, chatbot_id, is_live }, pool);
    return res.json({ message: 'Support status updated successfully', status: data });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Error updating support status:', err);
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}

export async function getMySupportStatusController(req, res, pool) {
  const user_id = req.user?.userId;
  try {
    const rows = await getMySupportStatusService(user_id, pool);
    return res.json(rows);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Error fetching user support status:', err);
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}


