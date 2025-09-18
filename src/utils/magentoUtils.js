import crypto from 'crypto';

/**
 * Generate OAuth 1.0a HMAC-SHA256 signature for Magento API
 */
export function generateOAuthSignature(method, baseUrl, oauthParams, consumerSecret, tokenSecret) {
  // Sort parameters alphabetically (OAuth 1.0a requirement)
  const sortedParams = Object.keys(oauthParams)
    .sort()
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(oauthParams[key])}`)
    .join('&');

  // Create signature base string
  const encodedBaseUrl = encodeURIComponent(baseUrl);
  const encodedParams = encodeURIComponent(sortedParams);
  const signatureBaseString = `${method}&${encodedBaseUrl}&${encodedParams}`;

  // Create signing key
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;

  // Generate signature
  const signature = crypto.createHmac('sha256', signingKey)
    .update(signatureBaseString)
    .digest('base64');

  return signature;
}

/**
 * Build OAuth 1.0a authorization header for Magento API
 */
export function buildMagentoAuthHeader(method, url, consumerKey, consumerSecret, accessToken, tokenSecret) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString('hex');

  // Parse URL to separate base URL from query parameters
  const urlObj = new URL(url);
  const oauthBaseUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
  
  // Create parameter object for OAuth signature (including query params)
  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA256',
    oauth_timestamp: timestamp,
    oauth_token: accessToken,
    oauth_version: '1.0'
  };

  // Add query parameters to OAuth params if they exist
  for (const [key, value] of urlObj.searchParams.entries()) {
    oauthParams[key] = value;
  }

  // Generate signature
  const signature = generateOAuthSignature(method, oauthBaseUrl, oauthParams, consumerSecret, tokenSecret);

  // Build Authorization header
  const authHeader = `OAuth oauth_consumer_key="${encodeURIComponent(consumerKey)}",oauth_token="${encodeURIComponent(accessToken)}",oauth_signature_method="HMAC-SHA256",oauth_timestamp="${timestamp}",oauth_nonce="${encodeURIComponent(nonce)}",oauth_version="1.0",oauth_signature="${encodeURIComponent(signature)}"`;

  return authHeader;
}

/**
 * Generate Magento tracking URL following the exact PHP approach
 */
export function generateMagentoTrackingUrl(baseUrl, incrementId, customerEmail) {
  if (!customerEmail) return null;
  
  const email = customerEmail.toLowerCase().trim();
  const hash = crypto.createHash('md5').update(email).digest('hex');
  
  // Build tracking URL: baseUrl/track-order?o=incrementId&e=hash
  const cleanBaseUrl = baseUrl.replace(/\/$/, ''); // rtrim equivalent
  return `${cleanBaseUrl}/track-order?o=${incrementId}&e=${hash}`;
}

/**
 * Transform Magento order data to standardized format
 */
export function transformMagentoOrder(order, baseUrl) {
  const trackingUrl = generateMagentoTrackingUrl(baseUrl, order.increment_id, order.customer_email);

  return {
    id: order.entity_id,
    order_number: order.increment_id,
    magentoBaseUrl: baseUrl,
    email: order.customer_email,
    trackingUrl: trackingUrl,
    phone: order.billing_address?.telephone || order.customer?.telephone,
    total_price: order.grand_total,
    currency: order.base_currency_code || order.order_currency_code,
    financial_status: order.status,
    fulfillment_status: order.status === 'shipped' ? 'fulfilled' : 'unfulfilled',
    created_at: order.created_at,
    updated_at: order.updated_at,
    customer_name: `${order.customer_firstname || ''} ${order.customer_lastname || ''}`.trim(),
    tags: [],
    line_items: order.items ? order.items.map(item => ({
      id: item.item_id,
      name: item.name,
      quantity: item.qty_ordered,
      price: item.base_price,
      fulfillment_status: item.qty_shipped > 0 ? 'fulfilled' : 'unfulfilled',
      sku: item.sku
    })) : [],
    billing_address: order.billing_address ? {
      first_name: order.billing_address.firstname,
      last_name: order.billing_address.lastname,
      address1: order.billing_address.street?.[0] || '',
      address2: order.billing_address.street?.[1] || '',
      city: order.billing_address.city,
      province: order.billing_address.region,
      country: order.billing_address.country_id,
      zip: order.billing_address.postcode,
      phone: order.billing_address.telephone
    } : null,
    shipping_address: order.extension_attributes?.shipping_assignments?.[0]?.shipping?.address ? {
      first_name: order.extension_attributes.shipping_assignments[0].shipping.address.firstname,
      last_name: order.extension_attributes.shipping_assignments[0].shipping.address.lastname,
      address1: order.extension_attributes.shipping_assignments[0].shipping.address.street?.[0] || '',
      address2: order.extension_attributes.shipping_assignments[0].shipping.address.street?.[1] || '',
      city: order.extension_attributes.shipping_assignments[0].shipping.address.city,
      province: order.extension_attributes.shipping_assignments[0].shipping.address.region,
      country: order.extension_attributes.shipping_assignments[0].shipping.address.country_id,
      zip: order.extension_attributes.shipping_assignments[0].shipping.address.postcode,
      phone: order.extension_attributes.shipping_assignments[0].shipping.address.telephone
    } : null
  };
}

/**
 * Filter orders by phone number
 */
export function filterOrdersByPhone(orders, phone) {
  if (!phone) return orders;

  console.log(`🔍 MAGENTO FILTER: Filtering ${orders.length} orders by phone: ${phone}`);
  
  return orders.filter(order => {
    const orderPhone = order.phone || order.billing_address?.phone || order.shipping_address?.phone;
    if (!orderPhone) return false;

    // Normalize phone numbers for comparison (remove all non-digits and compare last 8 digits)
    const normalizedInputPhone = String(phone).replace(/\D/g, '');
    const normalizedOrderPhone = String(orderPhone).replace(/\D/g, '');
    const inputLast8 = normalizedInputPhone.slice(-8);
    const orderLast8 = normalizedOrderPhone.slice(-8);

    const matches = inputLast8 === orderLast8 && inputLast8.length === 8;
    console.log(`${matches ? '✅' : '❌'} PHONE MATCH: Order ${order.id} - Input: "${phone}" -> "${inputLast8}", Order phone: "${orderPhone}" -> "${orderLast8}"`);
    return matches;
  });
}

/**
 * Build Magento API search URL with query parameters
 */
export function buildMagentoSearchUrl(baseUrl, searchParams) {
  const apiBaseUrl = `${baseUrl.replace(/\/$/, '')}/rest/V1/orders`;
  
  if (!searchParams.order_number && !searchParams.email) {
    return apiBaseUrl;
  }

  const queryParams = new URLSearchParams();
  
  if (searchParams.order_number) {
    queryParams.append('searchCriteria[filter_groups][0][filters][0][field]', 'increment_id');
    queryParams.append('searchCriteria[filter_groups][0][filters][0][value]', searchParams.order_number);
    queryParams.append('searchCriteria[filter_groups][0][filters][0][condition_type]', 'eq');
  } else if (searchParams.email) {
    queryParams.append('searchCriteria[filter_groups][0][filters][0][field]', 'customer_email');
    queryParams.append('searchCriteria[filter_groups][0][filters][0][value]', searchParams.email);
    queryParams.append('searchCriteria[filter_groups][0][filters][0][condition_type]', 'eq');
  }
  
  return `${apiBaseUrl}?${queryParams.toString()}`;
}
