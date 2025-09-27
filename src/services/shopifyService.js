import { buildShopifyTrackingFromFulfillments } from '../utils/shopifyUtils.js';

export async function getShopifyOrdersService(body, pool) {
  const {
    shopifyStore,
    shopifyAccessToken,
    shopifyApiVersion = '2024-10',
    email,
    phone,
    order_number,
    name,
    chatbot_id
  } = body;

  let finalShopifyStore = shopifyStore;
  let finalShopifyAccessToken = shopifyAccessToken;

  if ((!shopifyStore || !shopifyAccessToken) && chatbot_id) {
    try {
      const credentialsResult = await pool.query(
        'SELECT shopify_store, shopify_access_token FROM shopify_credentials WHERE chatbot_id = $1',
        [chatbot_id]
      );
      if (credentialsResult.rows.length > 0) {
        finalShopifyStore = credentialsResult.rows[0].shopify_store;
        finalShopifyAccessToken = credentialsResult.rows[0].shopify_access_token;
      }
    } catch (e) {
      console.error('SHOPIFY: DB credential fetch error:', e);
    }
  }

  if (!finalShopifyStore || !finalShopifyAccessToken) {
    throw new Error('Shopify credentials not available. Provide credentials or ensure chatbot_id has configured credentials.');
  }

  const baseUrl = `https://${finalShopifyStore}.myshopify.com/admin/api/${shopifyApiVersion}/orders.json`;
  const queryParams = new URLSearchParams();
  queryParams.append('status', 'any');
  queryParams.append('limit', '50');
  queryParams.append('fulfillment_status', 'any');
  if (email) queryParams.append('email', email);
  if (phone) queryParams.append('phone', phone);
  if (order_number) queryParams.append('name', order_number);

  const shopifyUrl = `${baseUrl}?${queryParams.toString()}`;

  const response = await fetch(shopifyUrl, {
    method: 'GET',
    headers: {
      'X-Shopify-Access-Token': finalShopifyAccessToken,
      'Content-Type': 'application/json',
      'User-Agent': 'DialogIntelligens-Chatbot/1.0'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Shopify API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  let filteredOrders = data.orders || [];

  if (email || phone || order_number) {
    filteredOrders = filteredOrders.filter(order => {
      const emailMatches = !email || (order.email && order.email.toLowerCase() === email.toLowerCase());
      const phoneMatches = !phone || (() => {
        const phoneLocations = [
          order.phone,
          order.billing_address?.phone,
          order.shipping_address?.phone,
          order.customer?.phone
        ].filter(p => typeof p === 'string');
        if (phoneLocations.length === 0) return false;
        const inputLast8 = String(phone).replace(/\D/g, '').slice(-8);
        return phoneLocations.some(p => String(p).replace(/\D/g, '').slice(-8) === inputLast8 && inputLast8.length === 8);
      })();
      const orderNumberMatches = !order_number || (() => {
        const normalizedInput = String(order_number).replace(/^#/, '').trim();
        const normalizedOrderName = order.name ? String(order.name).replace(/^#/, '').trim() : '';
        const normalizedOrderNumber = order.order_number ? String(order.order_number).replace(/^#/, '').trim() : '';
        return normalizedOrderName === normalizedInput || normalizedOrderNumber === normalizedInput;
      })();
      return emailMatches && phoneMatches && orderNumberMatches;
    });
  }

  const transformedOrders = await Promise.all(filteredOrders.map(async (order) => {
    let fulfillments = [];
    try {
      const fulfillmentUrl = `https://${finalShopifyStore}.myshopify.com/admin/api/${shopifyApiVersion}/orders/${order.id}/fulfillments.json`;
      const fulfillmentResponse = await fetch(fulfillmentUrl, {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': finalShopifyAccessToken,
          'Content-Type': 'application/json',
          'User-Agent': 'DialogIntelligens-Chatbot/1.0'
        }
      });
      if (fulfillmentResponse.ok) {
        const fulfillmentData = await fulfillmentResponse.json();
        fulfillments = fulfillmentData.fulfillments || [];
      }
    } catch (e) {
      console.warn('Shopify fulfillment fetch failed:', e.message);
    }

    const tracking = buildShopifyTrackingFromFulfillments(fulfillments);

    return {
      id: order.id,
      order_number: order.name || order.order_number,
      email: order.email,
      phone: order.phone || (order.billing_address && order.billing_address.phone),
      total_price: order.total_price,
      currency: order.currency,
      financial_status: order.financial_status,
      fulfillment_status: order.fulfillment_status,
      created_at: order.created_at,
      updated_at: order.updated_at,
      customer_name: order.customer && `${order.customer.first_name} ${order.customer.last_name}`.trim(),
      tags: order.tags ? order.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      line_items: (order.line_items || []).map(item => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        fulfillment_status: item.fulfillment_status,
        sku: item.sku,
        product_id: item.product_id,
        variant_id: item.variant_id
      })),
      shipping_address: order.shipping_address,
      billing_address: order.billing_address,
      fulfillments: tracking.fulfillments,
      primary_tracking: tracking.primary
    };
  }));

  return {
    success: true,
    orders: transformedOrders,
    total_count: transformedOrders.length,
    filtered_from: (data.orders || []).length
  };
}

export async function getShopifyOrderByIdService(params, query) {
  const { order_id } = params;
  const { shopifyStore, shopifyAccessToken, shopifyApiVersion = '2024-10' } = query;

  if (!shopifyStore || !shopifyAccessToken) {
    throw new Error('shopifyStore and shopifyAccessToken are required');
  }

  const url = `https://${shopifyStore}.myshopify.com/admin/api/${shopifyApiVersion}/orders/${order_id}.json`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Shopify-Access-Token': shopifyAccessToken,
      'Content-Type': 'application/json',
      'User-Agent': 'DialogIntelligens-Chatbot/1.0'
    }
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Shopify API error: ${response.status} ${errorText}`);
  }
  return await response.json();
}

export async function getShopifyCredentialsService(params, pool) {
  const { chatbot_id } = params;
  if (!chatbot_id) throw new Error('Chatbot ID is required');

  console.log('🔑 SHOPIFY: Fetching credentials for chatbot:', chatbot_id);

  const result = await pool.query(
    'SELECT chatbot_id, shopify_access_token, shopify_api_key, shopify_secret_key, shopify_store FROM shopify_credentials WHERE chatbot_id = $1',
    [chatbot_id]
  );

  if (result.rows.length === 0) {
    return { statusCode: 404, payload: { error: 'Shopify credentials not found for this chatbot' } };
  }

  const credentials = result.rows[0];
  return { statusCode: 200, payload: {
    success: true,
    credentials: {
      shopifyStore: credentials.shopify_store,
      shopifyAccessToken: credentials.shopify_access_token,
      shopifyApiKey: credentials.shopify_api_key,
      shopifySecretKey: credentials.shopify_secret_key,
      shopifyApiVersion: '2024-10' // Hardcoded as requested
    }
  }};
}

export async function upsertShopifyCredentialsService(body, pool) {
  const {
    chatbot_id,
    shopify_store,
    shopify_access_token,
    shopify_api_key,
    shopify_secret_key,
    shopify_api_version = '2024-10'
  } = body;

  if (!chatbot_id || !shopify_store || !shopify_access_token) {
    return { statusCode: 400, payload: { error: 'chatbot_id, shopify_store, and shopify_access_token are required' } };
  }

  console.log('🔑 SHOPIFY: Saving credentials for chatbot:', chatbot_id, 'store:', shopify_store);

  const result = await pool.query(`
    INSERT INTO shopify_credentials
    (chatbot_id, shopify_access_token, shopify_api_key, shopify_secret_key, shopify_store, shopify_api_version, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
    ON CONFLICT (chatbot_id)
    DO UPDATE SET
      shopify_access_token = EXCLUDED.shopify_access_token,
      shopify_api_key = EXCLUDED.shopify_api_key,
      shopify_secret_key = EXCLUDED.shopify_secret_key,
      shopify_store = EXCLUDED.shopify_store,
      shopify_api_version = EXCLUDED.shopify_api_version,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id, chatbot_id
  `, [chatbot_id, shopify_access_token, shopify_api_key, shopify_secret_key, shopify_store, shopify_api_version]);

  return { statusCode: 200, payload: {
    success: true,
    message: 'Shopify credentials saved successfully',
    id: result.rows[0].id
  }};
}

export async function deleteShopifyCredentialsService(params, pool) {
  const { chatbot_id } = params;
  if (!chatbot_id) throw new Error('Chatbot ID is required');

  console.log('🔑 SHOPIFY: Deleting credentials for chatbot:', chatbot_id);

  const result = await pool.query(
    'DELETE FROM shopify_credentials WHERE chatbot_id = $1 RETURNING id',
    [chatbot_id]
  );

  if (result.rows.length === 0) {
    return { statusCode: 404, payload: { error: 'Shopify credentials not found for this chatbot' } };
  }

  return { statusCode: 200, payload: {
    success: true,
    message: 'Shopify credentials deleted successfully'
  }};
}

