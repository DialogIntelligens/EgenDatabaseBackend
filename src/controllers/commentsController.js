import {
  listCommentsService,
  createCommentService,
  updateCommentService,
  deleteCommentService,
  markCommentsViewedService,
  markCommentsUnreadService
} from '../services/commentsService.js';

export async function listCommentsController(req, res, pool) {
  try {
    const rows = await listCommentsService(req.params.id, pool);
    res.json(rows);
  } catch (err) {
    console.error('Comments: list error:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
}

export async function createCommentController(req, res, pool) {
  try {
    const row = await createCommentService(req.params.id, req.body, pool);
    res.status(201).json(row);
  } catch (err) {
    const code = err.status || 500;
    console.error('Comments: create error:', err);
    res.status(code).json({ error: code === 400 ? 'Bad request' : 'Database error', details: err.message });
  }
}

export async function updateCommentController(req, res, pool) {
  try {
    const row = await updateCommentService(req.params.commentId, req.body, pool);
    res.json(row);
  } catch (err) {
    const code = err.status || 500;
    console.error('Comments: update error:', err);
    res.status(code).json({ error: code === 404 ? 'Comment not found' : 'Database error', details: err.message });
  }
}

export async function deleteCommentController(req, res, pool) {
  try {
    const result = await deleteCommentService(req.params.commentId, pool);
    res.json(result);
  } catch (err) {
    const code = err.status || 500;
    console.error('Comments: delete error:', err);
    res.status(code).json({ error: code === 404 ? 'Comment not found' : 'Database error', details: err.message });
  }
}

export async function markViewedController(req, res, pool) {
  try {
    const result = await markCommentsViewedService(req.params.id, req.user.userId, pool);
    res.json(result);
  } catch (err) {
    console.error('Comments: mark-viewed error:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
}

export async function markUnreadController(req, res, pool) {
  try {
    const result = await markCommentsUnreadService(req.params.id, req.user.userId, pool);
    res.json(result);
  } catch (err) {
    console.error('Comments: mark-unread error:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
}


