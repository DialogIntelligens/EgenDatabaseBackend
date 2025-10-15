import { parseChatbotIds } from '../utils/statisticsUtils.js';
import { analyzeConversations } from '../../textAnalysis.js';

export async function getConsolidatedStatisticsService(query, pool) {
  const { chatbot_id, start_date, end_date } = query;
  if (!chatbot_id) return { statusCode: 400, payload: { error: 'chatbot_id is required' } };

  try {
    const chatbotIds = parseChatbotIds(chatbot_id);

    let dateFilter = '';
    let queryParams = [chatbotIds];
    let paramIndex = 2;

    if (start_date && end_date) {
      dateFilter = ` AND c.created_at BETWEEN $${paramIndex++} AND $${paramIndex++}`;
      queryParams.push(start_date, end_date);
    }

    const statsQuery = `
      WITH conversation_stats AS (
        SELECT 
          c.id, c.created_at, c.emne, c.customer_rating, c.fallback, c.ligegyldig,
          c.purchase_tracking_enabled, c.user_id, c.chatbot_id,
          EXTRACT(HOUR FROM c.created_at) as hour_of_day,
          EXTRACT(DOW FROM c.created_at) as day_of_week,
          DATE(c.created_at) as conversation_date,
          COALESCE((
            SELECT COUNT(*)
            FROM jsonb_array_elements(c.conversation_data::jsonb) as msg
            WHERE (msg->>'isUser')::boolean = true
          ), 0) as user_message_count
        FROM conversations c
        WHERE c.chatbot_id = ANY($1) ${dateFilter}
      ),
      daily_aggregates AS (
        SELECT conversation_date, SUM(user_message_count) as daily_messages, COUNT(*) as daily_conversations
        FROM conversation_stats GROUP BY conversation_date
      ),
      hourly_aggregates AS (
        SELECT hour_of_day, SUM(user_message_count) as hourly_messages
        FROM conversation_stats GROUP BY hour_of_day
      ),
      topic_aggregates AS (
        SELECT COALESCE(emne, 'Unknown') as topic, COUNT(*) as topic_count
        FROM conversation_stats WHERE emne IS NOT NULL GROUP BY emne
      )
      SELECT 
        (SELECT COUNT(*) FROM conversation_stats) as total_conversations,
        (SELECT SUM(user_message_count) FROM conversation_stats) as total_messages,
        (SELECT AVG(customer_rating) FROM conversation_stats WHERE customer_rating IS NOT NULL) as avg_rating,
        (SELECT COUNT(*) FROM conversation_stats WHERE customer_rating IS NOT NULL) as total_ratings,
        (SELECT COUNT(*) FROM conversation_stats WHERE customer_rating >= 4) as satisfied_ratings,
        (SELECT COUNT(*) FROM conversation_stats WHERE customer_rating = 5) as thumbs_up_count,
        (SELECT COUNT(*) FROM conversation_stats WHERE customer_rating = 1) as thumbs_down_count,
        (SELECT COUNT(*) FROM conversation_stats WHERE fallback = true) as fallback_count,
        (SELECT COUNT(*) FROM conversation_stats WHERE fallback IS NOT NULL) as fallback_total,
        (SELECT COUNT(*) FROM conversation_stats WHERE ligegyldig = true) as ligegyldig_count,
        (SELECT COUNT(*) FROM conversation_stats WHERE ligegyldig IS NOT NULL) as ligegyldig_total,
        (SELECT json_object_agg(conversation_date::text, daily_messages) FROM daily_aggregates) as daily_data,
        (SELECT json_object_agg(hour_of_day::text, hourly_messages) FROM hourly_aggregates) as hourly_data,
        (SELECT json_object_agg(topic, topic_count) FROM topic_aggregates) as topic_data,
        (SELECT COUNT(*) FROM conversation_stats WHERE purchase_tracking_enabled = true) as purchase_tracking_conversations
    `;

    const statsResult = await pool.query(statsQuery, queryParams);
    const stats = statsResult.rows[0];

    const purchasePromises = chatbotIds.map(async (id) => {
      try {
        // Get purchase data
        const purchaseQuery = `
          SELECT COUNT(*) as purchase_count, SUM(amount) as total_revenue
          FROM purchases
          WHERE chatbot_id = $1 ${start_date && end_date ? 'AND created_at BETWEEN $2 AND $3' : ''}
        `;
        const purchaseParams = start_date && end_date ? [id, start_date, end_date] : [id];
        const purchaseResult = await pool.query(purchaseQuery, purchaseParams);

        // Get currency from chatbot_settings
        const currencyQuery = `SELECT currency FROM chatbot_settings WHERE chatbot_id = $1`;
        const currencyResult = await pool.query(currencyQuery, [id]);
        const currency = currencyResult.rows[0]?.currency || 'DKK';

        return {
          purchases: parseInt(purchaseResult.rows[0].purchase_count) || 0,
          revenue: parseFloat(purchaseResult.rows[0].total_revenue) || 0,
          currency: currency
        };
      } catch (error) {
        console.error(`Error fetching purchases for chatbot ${id}:`, error);
        return { purchases: 0, revenue: 0, currency: 'DKK' };
      }
    });


    const leadsPromise = (async () => {
      try {
        let leadsDateFilter = '';
        let leadsParams = [chatbotIds];
        let leadsParamIndex = 2;

        if (start_date && end_date) {
          leadsDateFilter = ` AND created_at BETWEEN $${leadsParamIndex++} AND $${leadsParamIndex++}`;
          leadsParams.push(start_date, end_date);
        }

        const leadsQuery = `
          SELECT COUNT(*) as leads_count
          FROM conversations
          WHERE chatbot_id = ANY($1) ${leadsDateFilter}
          AND form_data->>'type' IN ('kontaktformular', 'kundeservice_formular')
        `;
        const result = await pool.query(leadsQuery, leadsParams);
        return parseInt(result.rows[0].leads_count) || 0;
      } catch (error) {
        console.error('Error fetching leads count:', error);
        return 0;
      }
    })();

    const [purchaseResults, leadsCount] = await Promise.all([
      Promise.all(purchasePromises),
      leadsPromise
    ]);

    const totalPurchases = purchaseResults.reduce((sum, r) => sum + r.purchases, 0);
    const totalRevenue = purchaseResults.reduce((sum, r) => sum + r.revenue, 0);

    // Get currency from the first chatbot (assuming all chatbots use the same currency for statistics)
    const currency = purchaseResults.length > 0 ? purchaseResults[0].currency : 'DKK';

    const response = {
      totalMessages: parseInt(stats.total_messages) || 0,
      totalConversations: parseInt(stats.total_conversations) || 0,
      totalRatings: parseInt(stats.total_ratings) || 0,
      avgRating: stats.avg_rating ? parseFloat(stats.avg_rating).toFixed(2) : 'N/A',
      satisfiedRatings: parseInt(stats.satisfied_ratings) || 0,
      thumbsUpCount: parseInt(stats.thumbs_up_count) || 0,
      thumbsDownCount: parseInt(stats.thumbs_down_count) || 0,
      fallbackCount: parseInt(stats.fallback_count) || 0,
      fallbackTotal: parseInt(stats.fallback_total) || 0,
      fallbackRate: stats.fallback_total > 0 ? `${((stats.fallback_count / stats.fallback_total) * 100).toFixed(1)}%` : 'N/A',
      ligegyldigCount: parseInt(stats.ligegyldig_count) || 0,
      ligegyldigTotal: parseInt(stats.ligegyldig_total) || 0,
      ligegyldigRate: stats.ligegyldig_total > 0 ? `${((stats.ligegyldig_count / stats.ligegyldig_total) * 100).toFixed(1)}%` : 'N/A',
      dailyData: stats.daily_data || {},
      hourlyData: stats.hourly_data || {},
      topicData: stats.topic_data || {},
      totalPurchases,
      totalRevenue,
      currency, // Add currency to response
      averagePurchaseValue: totalPurchases > 0 ? (totalRevenue / totalPurchases).toFixed(2) : 'N/A',
      conversionRate: stats.purchase_tracking_conversations > 0 ? `${((totalPurchases / stats.purchase_tracking_conversations) * 100).toFixed(1)}%` : 'N/A',
      hasPurchaseTracking: totalPurchases > 0,
      totalContactFormulas: leadsCount,
      hasContactFormulaData: leadsCount > 0,
      contactFormulaConversionRate: stats.total_conversations > 0 ? `${((leadsCount / stats.total_conversations) * 100).toFixed(1)}%` : 'N/A'
    };

    return { statusCode: 200, payload: response };
  } catch (error) {
    console.error('Error fetching consolidated statistics:', error);
    return { statusCode: 500, payload: { error: 'Database error', details: error.message } };
  }
}

export async function getTagStatisticsService(query, pool) {
  const { chatbot_id, emne, start_date, end_date } = query;
  if (!chatbot_id) return { statusCode: 400, payload: { error: 'chatbot_id is required' } };

  try {
    const chatbotIds = parseChatbotIds(chatbot_id);
    let queryText = `
      SELECT tags, COUNT(*) as count
      FROM conversations
      WHERE chatbot_id = ANY($1) AND tags IS NOT NULL AND array_length(tags, 1) > 0
    `;
    let queryParams = [chatbotIds];
    let paramIndex = 2;

    if (emne && emne !== '') {
      queryText += ` AND emne = $${paramIndex++}`;
      queryParams.push(emne);
    }

    if (start_date && end_date) {
      queryText += ` AND created_at BETWEEN $${paramIndex++} AND $${paramIndex++}`;
      queryParams.push(start_date, end_date);
    }

    queryText += ` GROUP BY tags ORDER BY count DESC`;

    const result = await pool.query(queryText, queryParams);

    const tagCounts = {};
    result.rows.forEach(row => {
      const tags = row.tags;
      const count = parseInt(row.count);
      if (Array.isArray(tags)) {
        tags.forEach(tag => {
          if (tag && tag.trim()) {
            const cleanTag = tag.trim();
            tagCounts[cleanTag] = (tagCounts[cleanTag] || 0) + count;
          }
        });
      }
    });

    const tagStatistics = Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);

    return { statusCode: 200, payload: tagStatistics };
  } catch (err) {
    console.error('Error retrieving tag statistics:', err);
    return { statusCode: 500, payload: { error: 'Database error', details: err.message } };
  }
}

export async function analyzeConversationsService(body, pool) {
  try {
    const { chatbot_id, start_date, end_date } = body;
    if (!chatbot_id) return { statusCode: 400, payload: { error: 'chatbot_id is required' } };

    const chatbotIds = parseChatbotIds(chatbot_id);

    let queryText = `
      SELECT id, created_at, conversation_data, score, emne, customer_rating
      FROM conversations
      WHERE chatbot_id = ANY($1) AND score IS NOT NULL
    `;
    let queryParams = [chatbotIds];
    let paramIndex = 2;

    if (start_date && end_date) {
      queryText += ` AND created_at BETWEEN $${paramIndex++} AND $${paramIndex++}`;
      queryParams.push(start_date, end_date);
    }

    const result = await pool.query(queryText, queryParams);
    if (result.rows.length < 10) {
      return { statusCode: 400, payload: { error: 'Insufficient data for analysis', minimumRequired: 10, provided: result.rows.length } };
    }

    const analysisResults = await analyzeConversations(result.rows);
    return { statusCode: 200, payload: analysisResults };
  } catch (error) {
    console.error('Error analyzing conversations:', error);
    return { statusCode: 500, payload: { error: 'Server error', details: error.message } };
  }
}



