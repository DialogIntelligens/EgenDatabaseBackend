import pg from 'pg';
const { Pool } = pg;

// Initialize database connection (reuse existing pool from main app)
let pool;

export function setMagentoCredentialsPool(dbPool) {
    pool = dbPool;
}

export function registerMagentoCredentialsRoutes(app) {
    // Get Magento credentials for a specific chatbot
    app.get('/api/magento-credentials/:chatbotId', async (req, res) => {
        try {
            const { chatbotId } = req.params;

            if (!chatbotId) {
                return res.status(400).json({ error: 'Chatbot ID is required' });
            }

            const query = `
                SELECT id, magento_consumer_key, magento_consumer_secret, magento_base_url,
                       magento_access_token, magento_token_secret, magento_enabled, created_at, updated_at
                FROM magento_credentials
                WHERE chatbot_id = $1
                ORDER BY created_at DESC
                LIMIT 1
            `;

            const result = await pool.query(query, [chatbotId]);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'No Magento credentials found for this chatbot' });
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error fetching Magento credentials:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Create or update Magento credentials
    app.post('/api/magento-credentials', async (req, res) => {
        try {
            const {
                chatbotId,
                magentoConsumerKey,
                magentoConsumerSecret,
                magentoBaseUrl,
                magentoAccessToken,
                magentoTokenSecret,
                magentoEnabled = false
            } = req.body;

            if (!chatbotId) {
                return res.status(400).json({ error: 'Chatbot ID is required' });
            }

            // Check if credentials already exist for this chatbot
            const existingQuery = 'SELECT id FROM magento_credentials WHERE chatbot_id = $1';
            const existingResult = await pool.query(existingQuery, [chatbotId]);

            let result;
            if (existingResult.rows.length > 0) {
                // Update existing credentials
                const updateQuery = `
                    UPDATE magento_credentials
                    SET magento_consumer_key = $1,
                        magento_consumer_secret = $2,
                        magento_base_url = $3,
                        magento_access_token = $4,
                        magento_token_secret = $5,
                        magento_enabled = $6,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE chatbot_id = $7
                    RETURNING *
                `;
                result = await pool.query(updateQuery, [
                    magentoConsumerKey,
                    magentoConsumerSecret,
                    magentoBaseUrl,
                    magentoAccessToken,
                    magentoTokenSecret,
                    magentoEnabled,
                    chatbotId
                ]);
            } else {
                // Create new credentials
                const insertQuery = `
                    INSERT INTO magento_credentials (
                        chatbot_id,
                        magento_consumer_key,
                        magento_consumer_secret,
                        magento_base_url,
                        magento_access_token,
                        magento_token_secret,
                        magento_enabled
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                    RETURNING *
                `;
                result = await pool.query(insertQuery, [
                    chatbotId,
                    magentoConsumerKey,
                    magentoConsumerSecret,
                    magentoBaseUrl,
                    magentoAccessToken,
                    magentoTokenSecret,
                    magentoEnabled
                ]);
            }

            // Add hardcoded values to response
            const responseData = {
                ...result.rows[0],
                magento_api_version: 'V1',
                order_tracking_use_proxy: true,
                order_tracking_proxy_url: 'https://egendatabasebackend.onrender.com/api/magento/orders',
                order_tracking_request_method: 'POST',
                tracking_required_fields: JSON.stringify(['email', 'phone', 'order_number'])
            };

            res.json({
                success: true,
                data: responseData,
                message: existingResult.rows.length > 0 ? 'Credentials updated successfully' : 'Credentials created successfully'
            });
        } catch (error) {
            console.error('Error saving Magento credentials:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Delete Magento credentials
    app.delete('/api/magento-credentials/:chatbotId', async (req, res) => {
        try {
            const { chatbotId } = req.params;

            if (!chatbotId) {
                return res.status(400).json({ error: 'Chatbot ID is required' });
            }

            const query = 'DELETE FROM magento_credentials WHERE chatbot_id = $1 RETURNING *';
            const result = await pool.query(query, [chatbotId]);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'No Magento credentials found for this chatbot' });
            }

            res.json({
                success: true,
                message: 'Magento credentials deleted successfully'
            });
        } catch (error) {
            console.error('Error deleting Magento credentials:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Get Magento settings for chatbot script (public endpoint for integrations - SECURE VERSION)
    app.get('/api/magento-settings/:chatbotId', async (req, res) => {
        try {
            const { chatbotId } = req.params;

            if (!chatbotId) {
                return res.status(400).json({ error: 'Chatbot ID is required' });
            }

            const query = `
                SELECT magento_enabled, magento_base_url
                FROM magento_credentials
                WHERE chatbot_id = $1
                ORDER BY created_at DESC
                LIMIT 1
            `;

            const result = await pool.query(query, [chatbotId]);

            if (result.rows.length === 0) {
                // Return default values if no credentials found
                return res.json({
                    magentoEnabled: false,
                    magentoBaseUrl: '',
                    magentoApiVersion: 'V1',
                    orderTrackingUseProxy: true,
                    orderTrackingProxyUrl: 'https://egendatabasebackend.onrender.com/api/magento/orders',
                    orderTrackingRequestMethod: 'POST',
                    trackingRequiredFields: ['email', 'phone', 'order_number']
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

            // SECURITY: Only return non-sensitive configuration data
            res.json({
                magentoEnabled: row.magento_enabled === true, // Default to false if not set
                magentoBaseUrl: row.magento_base_url || '', // Base URL is not sensitive (it's public)
                // REMOVED: magentoAccessToken, magentoConsumerKey, magentoConsumerSecret, magentoTokenSecret (all sensitive!)
                magentoApiVersion: 'V1',
                orderTrackingUseProxy: true,
                orderTrackingProxyUrl: 'https://egendatabasebackend.onrender.com/api/magento/orders',
                orderTrackingRequestMethod: 'POST',
                trackingRequiredFields: ['email', 'phone', 'order_number']
            });
        } catch (error) {
            console.error('Error fetching Magento settings:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Get all Magento credentials (for admin purposes)
    app.get('/api/magento-credentials', async (req, res) => {
        try {
            const query = `
                SELECT id, chatbot_id, magento_base_url, magento_enabled, created_at, updated_at
                FROM magento_credentials
                ORDER BY created_at DESC
            `;

            const result = await pool.query(query);
            res.json(result.rows);
        } catch (error) {
            console.error('Error fetching all Magento credentials:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}
