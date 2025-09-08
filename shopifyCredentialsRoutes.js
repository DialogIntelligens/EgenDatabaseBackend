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
                       shopify_api_version, shopify_access_token, created_at, updated_at
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
                shopifyAccessToken
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
                        updated_at = CURRENT_TIMESTAMP
                    WHERE chatbot_id = $6
                    RETURNING *
                `;
                result = await pool.query(updateQuery, [
                    shopifyApiKey,
                    shopifySecretKey,
                    shopifyStore,
                    shopifyApiVersion,
                    shopifyAccessToken,
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
                        shopify_access_token
                    ) VALUES ($1, $2, $3, $4, $5, $6)
                    RETURNING *
                `;
                result = await pool.query(insertQuery, [
                    chatbotId,
                    shopifyApiKey,
                    shopifySecretKey,
                    shopifyStore,
                    shopifyApiVersion,
                    shopifyAccessToken
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

    // Get all Shopify credentials (for admin purposes)
    app.get('/api/shopify-credentials', async (req, res) => {
        try {
            const query = `
                SELECT id, chatbot_id, shopify_store, shopify_api_version, created_at, updated_at
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
