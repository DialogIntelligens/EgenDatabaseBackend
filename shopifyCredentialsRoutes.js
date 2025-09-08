import pg from 'pg';
const { Pool } = pg;

// Initialize database connection (reuse existing pool from main app)
let pool;

export function setShopifyCredentialsPool(dbPool) {
    pool = dbPool;
}

export function registerShopifyCredentialsRoutes(app) {
    // Get Shopify credentials for a specific chatbot
    app.get('/api/shopify-credentials/:chatbotId', async (req, res) => {
        try {
            const { chatbotId } = req.params;

            if (!chatbotId) {
                return res.status(400).json({ error: 'Chatbot ID is required' });
            }

            const query = `
                SELECT id, shopify_api_key, shopify_secret_key, shopify_store,
                       shopify_api_version, shopify_access_token, shopify_enabled,
                       order_tracking_use_proxy, order_tracking_proxy_url,
                       order_tracking_request_method, tracking_required_fields,
                       created_at, updated_at
                FROM shopify_credentials
                WHERE chatbot_id = $1
                ORDER BY created_at DESC
                LIMIT 1
            `;

            const result = await pool.query(query, [chatbotId]);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'No Shopify credentials found for this chatbot' });
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error fetching Shopify credentials:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Create or update Shopify credentials
    app.post('/api/shopify-credentials', async (req, res) => {
        try {
            const {
                chatbotId,
                shopifyApiKey,
                shopifySecretKey,
                shopifyStore,
                shopifyApiVersion = '2024-10',
                shopifyAccessToken,
                shopifyEnabled = true,
                orderTrackingUseProxy = true,
                orderTrackingProxyUrl = 'https://egendatabasebackend.onrender.com/api/shopify/orders',
                orderTrackingRequestMethod = 'POST',
                trackingRequiredFields = ['email', 'phone', 'order_number']
            } = req.body;

            if (!chatbotId) {
                return res.status(400).json({ error: 'Chatbot ID is required' });
            }

            // Check if credentials already exist for this chatbot
            const existingQuery = 'SELECT id FROM shopify_credentials WHERE chatbot_id = $1';
            const existingResult = await pool.query(existingQuery, [chatbotId]);

            let result;
            if (existingResult.rows.length > 0) {
                // Update existing credentials
                const updateQuery = `
                    UPDATE shopify_credentials
                    SET shopify_api_key = $1,
                        shopify_secret_key = $2,
                        shopify_store = $3,
                        shopify_api_version = $4,
                        shopify_access_token = $5,
                        shopify_enabled = $6,
                        order_tracking_use_proxy = $7,
                        order_tracking_proxy_url = $8,
                        order_tracking_request_method = $9,
                        tracking_required_fields = $10,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE chatbot_id = $11
                    RETURNING *
                `;
                result = await pool.query(updateQuery, [
                    shopifyApiKey,
                    shopifySecretKey,
                    shopifyStore,
                    shopifyApiVersion,
                    shopifyAccessToken,
                    shopifyEnabled,
                    orderTrackingUseProxy,
                    orderTrackingProxyUrl,
                    orderTrackingRequestMethod,
                    JSON.stringify(trackingRequiredFields),
                    chatbotId
                ]);
            } else {
                // Create new credentials
                const insertQuery = `
                    INSERT INTO shopify_credentials (
                        chatbot_id,
                        shopify_api_key,
                        shopify_secret_key,
                        shopify_store,
                        shopify_api_version,
                        shopify_access_token,
                        shopify_enabled,
                        order_tracking_use_proxy,
                        order_tracking_proxy_url,
                        order_tracking_request_method,
                        tracking_required_fields
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    RETURNING *
                `;
                result = await pool.query(insertQuery, [
                    chatbotId,
                    shopifyApiKey,
                    shopifySecretKey,
                    shopifyStore,
                    shopifyApiVersion,
                    shopifyAccessToken,
                    shopifyEnabled,
                    orderTrackingUseProxy,
                    orderTrackingProxyUrl,
                    orderTrackingRequestMethod,
                    JSON.stringify(trackingRequiredFields)
                ]);
            }

            res.json({
                success: true,
                data: result.rows[0],
                message: existingResult.rows.length > 0 ? 'Credentials updated successfully' : 'Credentials created successfully'
            });
        } catch (error) {
            console.error('Error saving Shopify credentials:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Delete Shopify credentials
    app.delete('/api/shopify-credentials/:chatbotId', async (req, res) => {
        try {
            const { chatbotId } = req.params;

            if (!chatbotId) {
                return res.status(400).json({ error: 'Chatbot ID is required' });
            }

            const query = 'DELETE FROM shopify_credentials WHERE chatbot_id = $1 RETURNING *';
            const result = await pool.query(query, [chatbotId]);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'No Shopify credentials found for this chatbot' });
            }

            res.json({
                success: true,
                message: 'Shopify credentials deleted successfully'
            });
        } catch (error) {
            console.error('Error deleting Shopify credentials:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Get Shopify settings for chatbot script (public endpoint for integrations)
    app.get('/api/shopify-settings/:chatbotId', async (req, res) => {
        try {
            const { chatbotId } = req.params;

            if (!chatbotId) {
                return res.status(400).json({ error: 'Chatbot ID is required' });
            }

            const query = `
                SELECT shopify_enabled, order_tracking_use_proxy,
                       order_tracking_proxy_url, order_tracking_request_method,
                       tracking_required_fields, shopify_store, shopify_access_token,
                       shopify_api_key, shopify_secret_key, shopify_api_version
                FROM shopify_credentials
                WHERE chatbot_id = $1
                ORDER BY created_at DESC
                LIMIT 1
            `;

            const result = await pool.query(query, [chatbotId]);

            if (result.rows.length === 0) {
                // Return default values if no credentials found
                return res.json({
                    shopifyEnabled: false,
                    orderTrackingUseProxy: true,
                    orderTrackingProxyUrl: 'https://egendatabasebackend.onrender.com/api/shopify/orders',
                    orderTrackingRequestMethod: 'POST',
                    trackingRequiredFields: ['email', 'phone', 'order_number'],
                    shopifyStore: '',
                    shopifyAccessToken: '',
                    shopifyApiKey: '',
                    shopifySecretKey: '',
                    shopifyApiVersion: '2024-10'
                });
            }

            const row = result.rows[0];
            let trackingRequiredFields = ['email', 'phone', 'order_number']; // Default
            
            if (row.tracking_required_fields) {
                try {
                    trackingRequiredFields = Array.isArray(row.tracking_required_fields) 
                        ? row.tracking_required_fields 
                        : JSON.parse(row.tracking_required_fields);
                } catch (e) {
                    console.error('Error parsing tracking_required_fields:', e);
                }
            }

            res.json({
                shopifyEnabled: row.shopify_enabled !== false, // Default to true if not set
                orderTrackingUseProxy: row.order_tracking_use_proxy !== false, // Default to true if not set
                orderTrackingProxyUrl: row.order_tracking_proxy_url || 'https://egendatabasebackend.onrender.com/api/shopify/orders',
                orderTrackingRequestMethod: row.order_tracking_request_method || 'POST',
                trackingRequiredFields: trackingRequiredFields,
                shopifyStore: row.shopify_store || '',
                shopifyAccessToken: row.shopify_access_token || '',
                shopifyApiKey: row.shopify_api_key || '',
                shopifySecretKey: row.shopify_secret_key || '',
                shopifyApiVersion: row.shopify_api_version || '2024-10'
            });
        } catch (error) {
            console.error('Error fetching Shopify settings:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Get all Shopify credentials (for admin purposes)
    app.get('/api/shopify-credentials', async (req, res) => {
        try {
            const query = `
                SELECT id, chatbot_id, shopify_store, shopify_api_version, shopify_enabled,
                       order_tracking_use_proxy, order_tracking_proxy_url,
                       order_tracking_request_method, tracking_required_fields,
                       created_at, updated_at
                FROM shopify_credentials
                ORDER BY created_at DESC
            `;

            const result = await pool.query(query);
            res.json(result.rows);
        } catch (error) {
            console.error('Error fetching all Shopify credentials:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}
