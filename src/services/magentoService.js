import { 
  buildMagentoAuthHeader, 
  transformMagentoOrder, 
  filterOrdersByPhone, 
  buildMagentoSearchUrl,
  validateMagentoTrackingFields
} from '../utils/magentoUtils.js';

/**
 * Fetch Magento credentials from database
 */
async function getMagentoCredentials(chatbot_id, pool) {
  if (!chatbot_id) return null;
  
  try {
    const result = await pool.query(
      'SELECT magento_base_url, magento_consumer_key, magento_consumer_secret, magento_access_token, magento_token_secret FROM magento_credentials WHERE chatbot_id = $1',
      [chatbot_id]
    );
    
    if (result.rows.length > 0) {
      const credentials = result.rows[0];
      console.log('🔑 MAGENTO: Successfully fetched credentials from database for base URL:', credentials.magento_base_url);
      return {
        baseUrl: credentials.magento_base_url,
        consumerKey: credentials.magento_consumer_key,
        consumerSecret: credentials.magento_consumer_secret,
        accessToken: credentials.magento_access_token,
        tokenSecret: credentials.magento_token_secret
      };
    } else {
      console.log('🔑 MAGENTO: No credentials found in database for chatbot:', chatbot_id);
      return null;
    }
  } catch (error) {
    console.error('🔑 MAGENTO: Error fetching credentials from database:', error);
    return null;
  }
}

/**
 * Make authenticated request to Magento API
 */
async function makeMagentoRequest(url, credentials) {
  const authHeader = buildMagentoAuthHeader(
    'GET',
    url,
    credentials.consumerKey,
    credentials.consumerSecret,
    credentials.accessToken,
    credentials.tokenSecret
  );

  console.log('🔑 MAGENTO: OAuth credentials check - Consumer Key:', credentials.consumerKey?.substring(0, 10) + '...');
  console.log('🔑 MAGENTO: OAuth credentials check - Access Token:', credentials.accessToken?.substring(0, 10) + '...');
  console.log('🔑 MAGENTO: Final URL being called:', url);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'User-Agent': 'DialogIntelligens-Chatbot/1.0'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Magento API error:', response.status, errorText);
    throw new Error(`Magento API error: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

/**
 * Search for Magento orders
 */
export async function searchMagentoOrdersService(body, pool) {
  const {
    magentoBaseUrl,
    magentoConsumerKey,
    magentoConsumerSecret,
    magentoAccessToken,
    magentoTokenSecret,
    email,
    phone,
    order_number,
    name,
    chatbot_id
  } = body;

  // Determine credentials to use
  let credentials = {
    baseUrl: magentoBaseUrl,
    consumerKey: magentoConsumerKey,
    consumerSecret: magentoConsumerSecret,
    accessToken: magentoAccessToken,
    tokenSecret: magentoTokenSecret
  };

  // If credentials not provided in request, try to fetch from database using chatbot_id
  if ((!magentoBaseUrl || !magentoConsumerKey || !magentoConsumerSecret || !magentoAccessToken || !magentoTokenSecret) && chatbot_id) {
    console.log('🔑 MAGENTO: Credentials not provided in request, fetching from database for chatbot:', chatbot_id);
    
    const dbCredentials = await getMagentoCredentials(chatbot_id, pool);
    if (dbCredentials) {
      credentials = dbCredentials;
    }
  }

  // Validate final credentials
  if (!credentials.baseUrl || !credentials.consumerKey || !credentials.consumerSecret || !credentials.accessToken || !credentials.tokenSecret) {
    throw new Error('Magento credentials not available. Either provide all Magento credentials in request, or ensure chatbot_id has credentials configured in database.');
  }

  // Validate tracking field combinations
  validateMagentoTrackingFields({ email, phone, order_number });

  // Build API URL
  const magentoUrl = buildMagentoSearchUrl(credentials.baseUrl, { email, order_number });
  
  console.log('Making Magento API request to:', magentoUrl.replace(credentials.accessToken, '[HIDDEN]'));

  // Make API request
  const data = await makeMagentoRequest(magentoUrl, credentials);

  // Transform orders
  const transformedOrders = data.items ? data.items.map(order => 
    transformMagentoOrder(order, credentials.baseUrl)
  ) : [];

  // Filter by phone if provided
  const filteredOrders = filterOrdersByPhone(transformedOrders, phone);

  console.log(`✅ MAGENTO: Found ${filteredOrders.length} orders matching criteria`);

  return {
    orders: filteredOrders,
    total_count: filteredOrders.length,
    filtered_from: transformedOrders.length
  };
}

/**
 * Get specific Magento order by ID
 */
export async function getMagentoOrderByIdService(params, query) {
  const { order_id } = params;
  const {
    magentoBaseUrl,
    magentoConsumerKey,
    magentoConsumerSecret,
    magentoAccessToken,
    magentoTokenSecret
  } = query;

  // Validate credentials
  if (!magentoBaseUrl || !magentoConsumerKey || !magentoConsumerSecret || !magentoAccessToken || !magentoTokenSecret) {
    throw new Error('magentoBaseUrl, magentoConsumerKey, magentoConsumerSecret, magentoAccessToken, and magentoTokenSecret are required');
  }

  const credentials = {
    baseUrl: magentoBaseUrl,
    consumerKey: magentoConsumerKey,
    consumerSecret: magentoConsumerSecret,
    accessToken: magentoAccessToken,
    tokenSecret: magentoTokenSecret
  };

  // Build API URL for specific order
  const magentoUrl = `${credentials.baseUrl.replace(/\/$/, '')}/rest/V1/orders/${order_id}`;
  
  console.log('Making Magento API request to:', magentoUrl.replace(credentials.accessToken, '[HIDDEN]'));

  // Make API request
  const order = await makeMagentoRequest(magentoUrl, credentials);

  // Transform single order
  const transformedOrder = transformMagentoOrder(order, credentials.baseUrl);

  return transformedOrder;
}
