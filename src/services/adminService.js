import bcrypt from 'bcryptjs';
import { Pinecone } from '@pinecone-database/pinecone';

export async function deleteUserService(userId, pool, getPineconeApiKeyForIndex) {
  const checkResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
  if (checkResult.rows.length === 0) {
    const err = new Error('User not found'); err.statusCode = 404; throw err;
  }

  await pool.query('DELETE FROM conversations WHERE user_id = $1', [userId]);

  const pineconeResult = await pool.query('SELECT * FROM pinecone_data WHERE user_id = $1', [userId]);
  for (const row of pineconeResult.rows) {
    try {
      const apiKey = await getPineconeApiKeyForIndex(userId, row.pinecone_index_name, row.namespace);
      if (apiKey && row.pinecone_vector_id && row.namespace) {
        const pineconeClient = new Pinecone({ apiKey });
        const index = pineconeClient.index(row.namespace);
        await index.deleteOne(row.pinecone_vector_id, { namespace: row.namespace });
      }
    } catch {}
  }
  await pool.query('DELETE FROM pinecone_data WHERE user_id = $1', [userId]);

  const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING username', [userId]);
  return result.rows[0];
}

export async function getUsersService(requestUser, includeArchived, pool) {
  let queryText = `
    SELECT id, username, is_admin, is_limited_admin, chatbot_ids, pinecone_api_key,
           pinecone_indexes, chatbot_filepath, thumbs_rating, monthly_payment, last_modified, archived
    FROM users`;
  let queryParams = [];

  const whereConditions = [];
  if (includeArchived !== 'true') {
    whereConditions.push('(archived IS NULL OR archived = FALSE)');
  }
  if (requestUser.isLimitedAdmin) {
    const ids = requestUser.accessibleUserIds || [];
    if (ids.length === 0) return [];
    whereConditions.push('id = ANY($1)');
    queryParams.push(ids);
  }
  if (whereConditions.length > 0) {
    queryText += ' WHERE ' + whereConditions.join(' AND ');
  }
  queryText += ' ORDER BY last_modified DESC NULLS LAST';

  const result = await pool.query(queryText, queryParams);
  return result.rows.map(u => ({ ...u, chatbot_filepath: u.chatbot_filepath || [], archived: u.archived || false }));
}

export async function getUserByIdService(userId, pool) {
  const result = await pool.query(`
    SELECT id, username, is_admin, chatbot_ids, pinecone_api_key,
           pinecone_indexes, chatbot_filepath, thumbs_rating, monthly_payment
    FROM users
    WHERE id = $1
  `, [userId]);
  if (result.rows.length === 0) { const err = new Error('User not found'); err.statusCode = 404; throw err; }
  const user = { ...result.rows[0], chatbot_filepath: result.rows[0].chatbot_filepath || [] };
  if (typeof user.pinecone_indexes === 'string') {
    try { user.pinecone_indexes = JSON.parse(user.pinecone_indexes); } catch { user.pinecone_indexes = []; }
  }
  return user;
}

export async function updateUserService(userId, updateData, pool) {
  const checkResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
  if (checkResult.rows.length === 0) { const err = new Error('User not found'); err.statusCode = 404; throw err; }

  const { chatbot_ids, chatbot_filepath, monthly_payment } = updateData;
  const updates = [];
  const values = [];
  let i = 1;
  if (chatbot_ids && Array.isArray(chatbot_ids)) { updates.push(`chatbot_ids = $${i++}`); values.push(chatbot_ids); }
  if (chatbot_filepath && Array.isArray(chatbot_filepath)) { updates.push(`chatbot_filepath = $${i++}`); values.push(chatbot_filepath); }
  if (monthly_payment !== undefined) { updates.push(`monthly_payment = $${i++}`); values.push(monthly_payment); }
  updates.push('last_modified = CURRENT_TIMESTAMP');
  values.push(userId);

  const result = await pool.query(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $${i} RETURNING id, username, chatbot_ids, chatbot_filepath, monthly_payment, last_modified`,
    values
  );
  return result.rows[0];
}

export async function resetPasswordService(userId, newPassword, pool) {
  const checkResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
  if (checkResult.rows.length === 0) { const err = new Error('User not found'); err.statusCode = 404; throw err; }
  const hashed = await bcrypt.hash(newPassword, 10);
  const result = await pool.query(
    'UPDATE users SET password = $1, last_modified = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, username',
    [hashed, userId]
  );
  return result.rows[0];
}

export async function archiveUserService(userId, archived, pool) {
  const checkResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
  if (checkResult.rows.length === 0) { const err = new Error('User not found'); err.statusCode = 404; throw err; }
  const result = await pool.query(
    'UPDATE users SET archived = $1, last_modified = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, username, archived',
    [archived, userId]
  );
  return result.rows[0];
}

export async function getArchivedUsersService(requestUser, pool) {
  let queryText = `
    SELECT id, username, is_admin, is_limited_admin, chatbot_ids, pinecone_api_key,
           pinecone_indexes, chatbot_filepath, thumbs_rating, monthly_payment, last_modified, archived
    FROM users
    WHERE archived = TRUE`;
  let queryParams = [];
  if (requestUser.isLimitedAdmin) {
    const ids = requestUser.accessibleUserIds || [];
    if (ids.length === 0) return [];
    queryText += ' AND id = ANY($1)';
    queryParams.push(ids);
  }
  queryText += ' ORDER BY last_modified DESC NULLS LAST';
  const result = await pool.query(queryText, queryParams);
  return result.rows.map(u => ({ ...u, chatbot_filepath: u.chatbot_filepath || [], archived: u.archived || false }));
}

export async function updateCompanyInfoService(userId, companyInfo, pool) {
  const result = await pool.query(
    'UPDATE users SET company_info = $1 WHERE id = $2 RETURNING id, username, company_info',
    [companyInfo, userId]
  );
  if (result.rows.length === 0) { const err = new Error('User not found'); err.statusCode = 404; throw err; }
  return result.rows[0];
}

export async function getConversationUpdateJobsService(pool) {
  const result = await pool.query(`
    SELECT cuj.*, u.username 
    FROM conversation_update_jobs cuj
    LEFT JOIN users u ON cuj.user_id = u.id
    ORDER BY cuj.created_at DESC
    LIMIT 50
  `);
  return result.rows;
}

export async function cancelConversationUpdateJobService(jobId, pool) {
  const result = await pool.query(`
    UPDATE conversation_update_jobs 
    SET status = 'cancelled', 
        completed_at = CURRENT_TIMESTAMP,
        last_updated = CURRENT_TIMESTAMP
    WHERE id = $1 AND status IN ('pending', 'running')
    RETURNING *
  `, [jobId]);
  if (result.rows.length === 0) { const err = new Error('Job not found or cannot be cancelled'); err.statusCode = 404; throw err; }
  return result.rows[0];
}

export async function getErrorLogsService(filters, pool) {
  const { chatbot_id, error_category, start_date, end_date, page = 0, page_size = 50 } = filters;
  let queryText = 'SELECT * FROM error_logs WHERE 1=1';
  const params = [];
  let i = 1;
  if (chatbot_id) { queryText += ` AND chatbot_id = $${i++}`; params.push(chatbot_id); }
  if (error_category) { queryText += ` AND error_category = $${i++}`; params.push(error_category); }
  if (start_date && end_date) { queryText += ` AND created_at BETWEEN $${i++} AND $${i++}`; params.push(start_date, end_date); }
  queryText += ` ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`;
  params.push(parseInt(page_size), parseInt(page) * parseInt(page_size));
  const result = await pool.query(queryText, params);
  return result.rows;
}

export async function getErrorStatisticsService(filters, pool) {
  const { start_date, end_date } = filters;
  let dateFilter = '';
  const params = [];
  let i = 1;
  if (start_date && end_date) { dateFilter = ` WHERE created_at BETWEEN $${i++} AND $${i++}`; params.push(start_date, end_date); }
  const total = await pool.query(`SELECT COUNT(*) as total_errors FROM error_logs${dateFilter}`, params);
  const byCat = await pool.query(`SELECT error_category, COUNT(*) as count FROM error_logs${dateFilter} GROUP BY error_category ORDER BY count DESC`, params);
  const byBot = await pool.query(`SELECT chatbot_id, COUNT(*) as count FROM error_logs${dateFilter} GROUP BY chatbot_id ORDER BY count DESC`, params);
  const trend = await pool.query(`SELECT DATE(created_at) as date, COUNT(*) as count FROM error_logs WHERE created_at >= NOW() - INTERVAL '7 days' GROUP BY DATE(created_at) ORDER BY date DESC`, []);
  return {
    total_errors: parseInt(total.rows[0].total_errors),
    by_category: byCat.rows,
    by_chatbot: byBot.rows,
    recent_trend: trend.rows
  };
}

// Admin Extensions
export async function getRevenueAnalyticsService(pool) {
  console.log('Revenue analytics service started');

  // Fetch all users with their monthly payments and chatbot IDs
  const usersQuery = `
    SELECT
      id,
      username,
      monthly_payment,
      chatbot_ids,
      thumbs_rating
    FROM users
    ORDER BY monthly_payment DESC NULLS LAST
  `;

  console.log('Executing users query...');
  const usersResult = await pool.query(usersQuery);
  const users = usersResult.rows;
  console.log(`Found ${users.length} users`);

  // For each user, calculate their message statistics and tracking data
  const usersWithStats = await Promise.all(users.map(async (user) => {
    try {
      console.log(`Processing user: ${user.username} (ID: ${user.id})`);

      // Get the user's chatbot IDs
      let chatbotIds = user.chatbot_ids || [];
      if (typeof chatbotIds === 'string') {
        try {
          chatbotIds = JSON.parse(chatbotIds);
        } catch (e) {
          console.error('Error parsing chatbot_ids for user:', user.username, e);
          chatbotIds = [];
        }
      }

      // Get user tracking data in parallel
      const [dashboardOpensResult, pageVisitsResult] = await Promise.all([
        pool.query(`
          SELECT
            COUNT(DISTINCT DATE(opened_at)) as total_dashboard_opens,
            COUNT(DISTINCT session_id) as unique_sessions,
            MAX(opened_at) as last_dashboard_open
          FROM user_dashboard_opens
          WHERE user_id = $1
        `, [user.id]),
        pool.query(`
          SELECT
            COUNT(*) as total_page_visits,
            COUNT(DISTINCT page_name) as unique_pages_visited,
            COUNT(DISTINCT DATE(visited_at)) as active_days,
            array_agg(DISTINCT page_name ORDER BY page_name) as visited_pages
          FROM user_page_visits
          WHERE user_id = $1
        `, [user.id])
      ]);

      const trackingData = {
        total_dashboard_opens: parseInt(dashboardOpensResult.rows[0]?.total_dashboard_opens) || 0,
        unique_sessions: parseInt(dashboardOpensResult.rows[0]?.unique_sessions) || 0,
        last_dashboard_open: dashboardOpensResult.rows[0]?.last_dashboard_open || null,
        total_page_visits: parseInt(pageVisitsResult.rows[0]?.total_page_visits) || 0,
        unique_pages_visited: parseInt(pageVisitsResult.rows[0]?.unique_pages_visited) || 0,
        tracking_active_days: parseInt(pageVisitsResult.rows[0]?.active_days) || 0,
        visited_pages: pageVisitsResult.rows[0]?.visited_pages?.filter(Boolean) || []
      };

      if (!Array.isArray(chatbotIds) || chatbotIds.length === 0) {
        console.log(`User ${user.username} has no chatbot IDs`);
        return {
          ...user,
          total_messages: 0,
          monthly_payment: parseFloat(user.monthly_payment) || 0,
          average_monthly_messages: 0,
          last_month_messages: 0,
          average_monthly_conversations: 0,
          last_month_conversations: 0,
          csat: 'N/A',
          conversion_rate: 'N/A',
          fallback_rate: 'N/A',
          ...trackingData
        };
      }

      console.log(`User ${user.username} owns chatbots: ${chatbotIds.join(', ')}`);

      // Get all conversations for chatbots owned by this user
      const conversationsQuery = `
        SELECT
          conversation_data,
          created_at,
          chatbot_id,
          customer_rating,
          purchase_tracking_enabled,
          fallback,
          ligegyldig,
          -- Pre-calculate message counts using PostgreSQL JSON functions
          COALESCE((
            SELECT COUNT(*)
            FROM jsonb_array_elements(conversation_data::jsonb) as msg
            WHERE (msg->>'isUser')::boolean = true
          ), 0) as user_message_count
        FROM conversations
        WHERE chatbot_id = ANY($1)
      `;

      const conversationsResult = await pool.query(conversationsQuery, [chatbotIds]);
      const conversations = conversationsResult.rows;
      console.log(`Found ${conversations.length} conversations for user ${user.username}'s chatbots`);

      // Calculate total messages and conversations for this user's chatbots
      let totalMessages = 0;
      let monthlyMessages = 0;
      let lastMonthMessages = 0;
      let totalConversations = 0;
      let monthlyConversations = 0;
      let lastMonthConversations = 0;
      let totalRatingsCount = 0;
      let thumbsUpCount = 0;
      let satisfiedCount = 0;
      let fallbackCount = 0;
      let ligegyldigCount = 0;
      let conversationsWithPurchaseTracking = 0;
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Calculate last month (previous calendar month)
      const now = new Date();
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

      // Calculate user's account age in days for average calculation
      const userCreatedAt = new Date(conversations.length > 0 ?
        Math.min(...conversations.map(conv => new Date(conv.created_at).getTime())) : now);
      const daysActive = Math.max(1, Math.ceil((now - userCreatedAt) / (1000 * 60 * 60 * 24))); // Days active

      console.log(`User ${user.username} calculation: First conversation: ${userCreatedAt.toISOString()}, Days active: ${daysActive}`);

      conversations.forEach(conv => {
        // Count conversations
        totalConversations += 1;

        // Use pre-calculated message count from database instead of parsing JSON
        const userMessageCount = parseInt(conv.user_message_count) || 0;
        totalMessages += userMessageCount;

        // Count metadata-based metrics
        if (conv.purchase_tracking_enabled === true) {
          conversationsWithPurchaseTracking += 1;
        }
        if (typeof conv.customer_rating === 'number') {
          totalRatingsCount += 1;
          if (user.thumbs_rating) {
            if (conv.customer_rating === 5) thumbsUpCount += 1;
          } else if (conv.customer_rating >= 4) {
            satisfiedCount += 1;
          }
        }
        if (conv.fallback === true) {
          fallbackCount += 1;
        }
        if (conv.ligegyldig === true) {
          ligegyldigCount += 1;
        }

          // Count monthly messages (only from last 30 days)
          const conversationDate = new Date(conv.created_at);
          if (conversationDate >= thirtyDaysAgo) {
          monthlyMessages += userMessageCount;
            monthlyConversations += 1;
          }

          // Count last month messages (previous calendar month)
          if (conversationDate >= lastMonthStart && conversationDate <= lastMonthEnd) {
          lastMonthMessages += userMessageCount;
            lastMonthConversations += 1;
        }
      });

      // Calculate average monthly messages: (total messages / days active) * 30
      const averageDailyMessages = totalMessages / daysActive;
      const averageMonthlyMessages = averageDailyMessages * 30;

      // Calculate average monthly conversations: (total conversations / days active) * 30
      const averageDailyConversations = totalConversations / daysActive;
      const averageMonthlyConversations = averageDailyConversations * 30;

      // Safely parse monthly_payment
      let monthlyPayment = 0;
      if (user.monthly_payment !== null && user.monthly_payment !== undefined) {
        monthlyPayment = parseFloat(user.monthly_payment) || 0;
      }

      // Purchases count for this user's chatbots (all time)
      const purchasesCountResult = await pool.query(
        `SELECT COUNT(*)::int as cnt FROM purchases WHERE chatbot_id = ANY($1)`,
        [chatbotIds]
      );
      const purchasesCount = purchasesCountResult.rows[0]?.cnt || 0;

      // Compute per-user CSAT
      let csat = 'N/A';
      if (totalRatingsCount > 0) {
        if (user.thumbs_rating) {
          csat = `${((thumbsUpCount / totalRatingsCount) * 100).toFixed(1)}%`;
        } else {
          csat = `${((satisfiedCount / totalRatingsCount) * 100).toFixed(1)}%`;
        }
      }

      // Compute per-user conversion rate: purchases / conversations with purchase tracking
      let conversionRate = 'N/A';
      if (conversationsWithPurchaseTracking > 0) {
        conversionRate = `${((purchasesCount / conversationsWithPurchaseTracking) * 100).toFixed(1)}%`;
      }

      // Compute per-user fallback rate
      let fallbackRate = 'N/A';
      if (conversations.length > 0) {
        fallbackRate = `${((fallbackCount / conversations.length) * 100).toFixed(1)}%`;
      }

      // Compute per-user ligegyldig rate
      let ligegyldigRate = 'N/A';
      if (conversations.length > 0) {
        ligegyldigRate = `${((ligegyldigCount / conversations.length) * 100).toFixed(1)}%`;
      }

      console.log(`User ${user.username}: ${totalMessages} total msgs, ${Math.round(averageMonthlyMessages)} avg monthly msgs, purchases ${purchasesCount}, ratings ${totalRatingsCount}, csat ${csat}, convRate ${conversionRate}, fallback ${fallbackRate}, ligegyldig ${ligegyldigRate}`);

      return {
        ...user,
        total_messages: totalMessages,
        total_conversations: totalConversations,
        monthly_messages: monthlyMessages, // Last 30 days
        average_monthly_messages: Math.round(averageMonthlyMessages),
        last_month_messages: lastMonthMessages,
        monthly_conversations: monthlyConversations, // Last 30 days
        average_monthly_conversations: Math.round(averageMonthlyConversations),
        last_month_conversations: lastMonthConversations,
        days_active: daysActive,
        monthly_payment: monthlyPayment,
        csat: csat,
        conversion_rate: conversionRate,
        fallback_rate: fallbackRate,
        ligegyldig_rate: ligegyldigRate,
        ...trackingData
      };
    } catch (error) {
      console.error(`Error calculating stats for user ${user.username}:`, error);
      // Return user with default stats if there's an error
      return {
        ...user,
        total_messages: 0,
        total_conversations: 0,
        monthly_payment: parseFloat(user.monthly_payment) || 0,
        total_dashboard_opens: 0,
        unique_sessions: 0,
        last_dashboard_open: null,
        total_page_visits: 0,
        unique_pages_visited: 0,
        tracking_active_days: 0,
        visited_pages: []
      };
    }
  }));

  console.log('Finished processing all users, calculating summary...');

  // Calculate summary statistics
  const payingUsers = usersWithStats.filter(user => user.monthly_payment > 0);
  const totalRevenue = payingUsers.reduce((sum, user) => sum + user.monthly_payment, 0);
  const averagePayment = payingUsers.length > 0 ? totalRevenue / payingUsers.length : 0;

  console.log(`Summary: ${users.length} total users, ${payingUsers.length} paying users, ${totalRevenue} kr total revenue`);

  return {
    users: usersWithStats,
    summary: {
      total_users: users.length,
      paying_users: payingUsers.length,
      total_monthly_revenue: totalRevenue,
      average_monthly_payment: averagePayment
    }
  };
}

export async function getMonthlyConversationBreakdownService(pool) {
  console.log('Monthly conversation breakdown service started');

  // Fetch all users with their monthly payments and chatbot IDs
  const usersQuery = `
    SELECT
      id,
      username,
      monthly_payment,
      chatbot_ids
    FROM users
    WHERE monthly_payment > 0
    ORDER BY monthly_payment DESC
  `;

  const usersResult = await pool.query(usersQuery);
  const users = usersResult.rows;
  console.log(`Found ${users.length} paying users`);

  // For each user, get monthly conversation breakdown for the last 12 months
  const usersWithMonthlyData = await Promise.all(users.map(async (user) => {
    try {
      console.log(`Processing monthly data for user: ${user.username} (ID: ${user.id})`);

      // Get the user's chatbot IDs
      let chatbotIds = user.chatbot_ids || [];
      if (typeof chatbotIds === 'string') {
        try {
          chatbotIds = JSON.parse(chatbotIds);
        } catch (e) {
          console.error('Error parsing chatbot_ids for user:', user.username, e);
          chatbotIds = [];
        }
      }

      if (chatbotIds.length === 0) {
        console.log(`No chatbot IDs found for user: ${user.username}`);
        return {
          ...user,
          monthly_conversations: {}
        };
      }

      // Query to get monthly conversation counts for the last 12 months
      const monthlyQuery = `
        SELECT
          DATE_TRUNC('month', created_at) as month,
          COUNT(*) as conversation_count
        FROM conversations
        WHERE chatbot_id = ANY($1)
          AND created_at >= NOW() - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month DESC
      `;

      const monthlyResult = await pool.query(monthlyQuery, [chatbotIds]);
      console.log(`Monthly query result for ${user.username}:`, monthlyResult.rows);

      // Convert results to a more usable format
      const monthlyConversations = {};
      monthlyResult.rows.forEach(row => {
        const date = new Date(row.month);
        const year = date.getFullYear();
        const month = date.getMonth() + 1; // JavaScript months are 0-indexed
        const monthKey = `${year}-${month.toString().padStart(2, '0')}`;
        monthlyConversations[monthKey] = parseInt(row.conversation_count);
      });

      console.log(`Found monthly data for ${user.username}:`, Object.keys(monthlyConversations).length, 'months');

      return {
        ...user,
        monthly_conversations: monthlyConversations
      };

    } catch (error) {
      console.error(`Error processing monthly data for user ${user.username}:`, error);
      return {
        ...user,
        monthly_conversations: {}
      };
    }
  }));

  console.log('Monthly conversation breakdown service completed');
  return {
    users: usersWithMonthlyData
  };
}

export async function getUserTrackingStatsService(pool) {
  // Get dashboard opens stats for all users
  const dashboardStats = await pool.query(`
    SELECT
      u.id,
      u.username,
      COUNT(DISTINCT DATE(udo.opened_at)) as total_dashboard_opens,
      COUNT(DISTINCT udo.session_id) as unique_sessions,
      MAX(udo.opened_at) as last_dashboard_open
    FROM users u
    LEFT JOIN user_dashboard_opens udo ON u.id = udo.user_id
    WHERE u.monthly_payment > 0
    GROUP BY u.id, u.username
    ORDER BY total_dashboard_opens DESC
  `);

  // Get page visit stats for all users
  const pageVisitStats = await pool.query(`
    SELECT
      u.id,
      u.username,
      COUNT(*) as total_page_visits,
      COUNT(DISTINCT upv.page_name) as unique_pages_visited,
      COUNT(DISTINCT DATE(upv.visited_at)) as active_days,
      array_agg(DISTINCT upv.page_name) as visited_pages
    FROM users u
    LEFT JOIN user_page_visits upv ON u.id = upv.user_id
    WHERE u.monthly_payment > 0
    GROUP BY u.id, u.username
    ORDER BY total_page_visits DESC
  `);

  // Get most popular pages
  const popularPages = await pool.query(`
    SELECT
      page_name,
      COUNT(*) as visit_count,
      COUNT(DISTINCT user_id) as unique_users
    FROM user_page_visits upv
    JOIN users u ON upv.user_id = u.id
    WHERE u.monthly_payment > 0
    GROUP BY page_name
    ORDER BY visit_count DESC
  `);

  // Merge the stats
  const userStats = dashboardStats.rows.map(user => {
    const pageStats = pageVisitStats.rows.find(p => p.id === user.id) || {
      total_page_visits: 0,
      unique_pages_visited: 0,
      active_days: 0,
      visited_pages: []
    };

    return {
      ...user,
      ...pageStats,
      visited_pages: pageStats.visited_pages ? pageStats.visited_pages.filter(Boolean) : []
    };
  });

  return {
    users: userStats,
    popular_pages: popularPages.rows
  };
}

export async function updateUserPineconeApiKeyService(userId, pineconeApiKey, pool) {
  // First check if the user exists
  const checkResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
  if (checkResult.rows.length === 0) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  // Update the user's Pinecone API key and last_modified timestamp
  const result = await pool.query(
    'UPDATE users SET pinecone_api_key = $1, last_modified = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, username',
    [pineconeApiKey.trim(), userId]
  );

  return {
    id: result.rows[0].id,
    username: result.rows[0].username
  };
}

export async function updateUserIndexesService(userId, pineconeIndexes, pool) {
  // First check if the user exists
  const checkResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
  if (checkResult.rows.length === 0) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  // Convert the array to JSON string
  const indexesJson = JSON.stringify(pineconeIndexes);

  // Update the user's indexes and last_modified timestamp
  const result = await pool.query(
    'UPDATE users SET pinecone_indexes = $1, last_modified = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, username',
    [indexesJson, userId]
  );

  return {
    id: result.rows[0].id,
    username: result.rows[0].username
  };
}


