import { proxyOrderService } from '../services/bodylabService.js';

export async function proxyOrderController(req, res) {
  try {
    console.log('Bodylab API request:', JSON.stringify(req.body, null, 2));
    const { statusCode, payload } = await proxyOrderService(req.body);
    if (statusCode !== 200 && payload?.status === 'error') {
      return res.status(statusCode).json(payload);
    }
    return res.json(payload);
  } catch (error) {
    console.error('Error proxying request:', error);
    return res.status(500).json({
      status: 'success',
      message: 'Could not retrieve order information. The system might be temporarily unavailable.',
      orders: [{
        order_number: req.body?.order_number || 'Unknown',
        order_status: 'Error',
        trackingNumber: '',
        trackingDate: '',
        attention: 'Der opstod en teknisk fejl. Prøv igen senere eller kontakt kundeservice.'
      }]
    });
  }
}


