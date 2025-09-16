import express from 'express';
import {
  getUserStatisticSettingsController,
  updateUserStatisticSettingsController
} from '../controllers/userSettingsController.js';

export function registerUserSettingsRoutes(app, pool, authenticateToken) {
  const router = express.Router();

  router.get('/user-statistic-settings', authenticateToken, async (req, res) => {
    await getUserStatisticSettingsController(req, res, pool);
  });

  router.put('/user-statistic-settings', authenticateToken, async (req, res) => {
    await updateUserStatisticSettingsController(req, res, pool);
  });

  app.use('/', router);
}


