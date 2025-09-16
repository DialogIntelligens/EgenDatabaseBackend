import { proxyBevcoOrderService } from '../services/bevcoService.js';

export async function proxyBevcoOrderController(req, res) {
  try {
    const result = await proxyBevcoOrderService(req.body);
    res.json(result);
  } catch (error) {
    console.error('BevCo proxy error:', error);
    res.status(500).json({
      status: 'success',
      message: 'Could not retrieve order information. The system might be temporarily unavailable.',
      orders: [{
        order_number: req.body?.order_number || 'Unknown',
        order_status: 'Error',
        attention: 'Der opstod en teknisk fejl. Prøv igen senere eller kontakt kundeservice.'
      }]
    });
  }
}


