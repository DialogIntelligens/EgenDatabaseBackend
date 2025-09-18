import { logErrorService } from '../services/errorsService.js';

export async function logErrorController(req, res, pool) {
  try {
    const { statusCode, payload } = await logErrorService(req.body, pool);
    return res.status(statusCode).json(payload);
  } catch (err) {
    console.error('Error logging error to database:', err);
    return res.status(500).json({ error: 'Failed to log error', details: err.message });
  }
}
