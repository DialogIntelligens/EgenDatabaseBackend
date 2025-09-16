export function buildBevcoHeaders() {
  return {
    'Content-Type': 'application/json',
    'sw-api-key': process.env.BEVCO_API_KEY || '9533ee33bf82412f94dd8936ce59b908',
    'sw-access-key': process.env.BEVCO_ACCESS_KEY || 'SWSCX1MTFXXC4BHA0UDNEHYBFQ'
  };
}

export function normalizeBevcoResponse(data, fallbackOrderNumber) {
  const standardized = { status: 'success', orders: [] };

  if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
    standardized.orders = [{
      order_number: fallbackOrderNumber || 'Unknown',
      order_status: 'Error',
      attention: 'Der kunne ikke hentes ordredetaljer. Formatet af svaret var uventet.'
    }];
    return standardized;
  }

  if (Array.isArray(data)) {
    standardized.orders = data;
    return standardized;
  }

  if (Array.isArray(data.orders)) {
    standardized.orders = data.orders;
    return standardized;
  }

  standardized.orders = [data];
  return standardized;
}


