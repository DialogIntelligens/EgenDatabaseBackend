import { sanitizeBodylabResponseText, extractOrdersWithRegex } from '../utils/bodylabUtils.js';

export async function proxyOrderService(body) {
  const response = await fetch('https://www.bodylab.dk/api/order.asp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const responseText = await response.text();

  if (!response.ok) {
    return {
      statusCode: response.status,
      payload: {
        status: 'error',
        message: `Failed to fetch order details. ${response.status} ${response.statusText}`,
        details: responseText
      }
    };
  }

  const cleanedText = sanitizeBodylabResponseText(responseText);

  try {
    const data = JSON.parse(cleanedText);
    if (Array.isArray(data) && data.length > 0 && data[0].order_number) {
      return { statusCode: 200, payload: { status: 'success', orders: data } };
    }
    if (data.order_number && !data.orders) {
      return { statusCode: 200, payload: { status: 'success', orders: [data] } };
    }
    if (data.orders && !Array.isArray(data.orders)) data.orders = [data.orders];
    return { statusCode: 200, payload: data };
  } catch (err) {
    const orders = extractOrdersWithRegex(cleanedText);
    if (orders) return { statusCode: 200, payload: { status: 'success', orders } };

    return {
      statusCode: 200,
      payload: {
        status: 'success',
        orders: [{
          order_number: body.order_number || 'Unknown',
          order_status: 'Unknown',
          trackingNumber: '',
          trackingDate: '',
          attention: 'Der opstod en teknisk fejl ved hentning af dine ordredetaljer.'
        }]
      }
    };
  }
}


