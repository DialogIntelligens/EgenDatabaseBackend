import express from 'express';
import {
  listCommentsController,
  createCommentController,
  updateCommentController,
  deleteCommentController,
  markViewedController,
  markUnreadController
} from '../controllers/commentsController.js';

export function registerCommentsRoutes(app, pool, authenticateToken) {
  const router = express.Router();

  router.get('/conversations/:id/comments', authenticateToken, async (req, res) => {
    await listCommentsController(req, res, pool);
  });

  router.post('/conversations/:id/comments', authenticateToken, async (req, res) => {
    await createCommentController(req, res, pool);
  });

  router.put('/conversations/:id/comments/:commentId', authenticateToken, async (req, res) => {
    await updateCommentController(req, res, pool);
  });

  router.delete('/conversations/:id/comments/:commentId', authenticateToken, async (req, res) => {
    await deleteCommentController(req, res, pool);
  });

  router.post('/conversations/:id/comments/mark-viewed', authenticateToken, async (req, res) => {
    await markViewedController(req, res, pool);
  });

  router.post('/conversations/:id/comments/mark-unread', authenticateToken, async (req, res) => {
    await markUnreadController(req, res, pool);
  });

  app.use('/', router);
}


