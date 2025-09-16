export async function listCommentsService(conversationId, pool) {
  const result = await pool.query(
    'SELECT * FROM conversation_comments WHERE conversation_id = $1 ORDER BY created_at ASC',
    [conversationId]
  );
  return result.rows;
}

export async function createCommentService(conversationId, { username, comment_text }, pool) {
  if (!username || !comment_text) {
    const err = new Error('Username and comment_text are required');
    err.status = 400;
    throw err;
  }
  const result = await pool.query(
    'INSERT INTO conversation_comments (conversation_id, username, comment_text) VALUES ($1, $2, $3) RETURNING *',
    [conversationId, username, comment_text]
  );
  return result.rows[0];
}

export async function updateCommentService(commentId, { username, comment_text }, pool) {
  if (!username || !comment_text) {
    const err = new Error('Username and comment_text are required');
    err.status = 400;
    throw err;
  }
  const result = await pool.query(
    'UPDATE conversation_comments SET username = $1, comment_text = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
    [username, comment_text, commentId]
  );
  if (result.rows.length === 0) {
    const err = new Error('Comment not found');
    err.status = 404;
    throw err;
  }
  return result.rows[0];
}

export async function deleteCommentService(commentId, pool) {
  const result = await pool.query(
    'DELETE FROM conversation_comments WHERE id = $1 RETURNING *',
    [commentId]
  );
  if (result.rows.length === 0) {
    const err = new Error('Comment not found');
    err.status = 404;
    throw err;
  }
  return { message: 'Comment deleted successfully', deleted: result.rows[0] };
}

export async function markCommentsViewedService(conversationId, userId, pool) {
  const comments = await pool.query(
    'SELECT id FROM conversation_comments WHERE conversation_id = $1',
    [conversationId]
  );
  if (comments.rows.length === 0) {
    return { message: 'No comments to mark as viewed' };
  }
  for (const row of comments.rows) {
    await pool.query(
      `INSERT INTO conversation_comment_views (user_id, comment_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, comment_id) DO NOTHING`,
      [userId, row.id]
    );
  }
  return { message: 'Comments marked as viewed', count: comments.rows.length };
}

export async function markCommentsUnreadService(conversationId, userId, pool) {
  const comments = await pool.query(
    'SELECT id FROM conversation_comments WHERE conversation_id = $1',
    [conversationId]
  );
  if (comments.rows.length === 0) {
    return { message: 'No comments to mark as unread' };
  }
  const ids = comments.rows.map(c => c.id);
  await pool.query(
    'DELETE FROM conversation_comment_views WHERE user_id = $1 AND comment_id = ANY($2)',
    [userId, ids]
  );
  return { message: 'Comments marked as unread', count: ids.length };
}


