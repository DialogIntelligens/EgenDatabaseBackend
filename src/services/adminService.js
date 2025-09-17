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


