import { buildBevcoHeaders, normalizeBevcoResponse } from '../utils/bevcoUtils.js';

const BEVCO_URL = 'https://api.bevco.dk/store-api/dialog-intelligens/order/search';

export async function proxyBevcoOrderService(body) {
  const response = await fetch(BEVCO_URL, {
    method: 'POST',
    headers: buildBevcoHeaders(),
    body: JSON.stringify(body)
  });

  const responseText = await response.text();
  if (!response.ok) {
    return {
      status: 'success',
      message: `Failed to fetch order details. ${response.status} ${response.statusText}`,
      orders: [{
        order_number: body?.order_number || 'Unknown',
        order_status: 'Error',
        attention: 'Der opstod en teknisk fejl. Prøv igen senere eller kontakt kundeservice.'
      }]
    };
  }

  try {
    const data = responseText ? JSON.parse(responseText) : {};
    return normalizeBevcoResponse(data, body?.order_number);
  } catch (_) {
    return {
      status: 'success',
      orders: [{
        order_number: body?.order_number || 'Unknown',
        order_status: 'Error',
        attention: 'Der kunne ikke hentes ordredetaljer. Formatet af svaret var uventet.'
      }]
    };
  }
}


