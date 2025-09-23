import { isValidTime } from '../utils/userSettingsUtils.js';
import {
  getUserStatisticSettingsService,
  updateUserStatisticSettingsService
} from '../services/userSettingsService.js';

export async function getUserStatisticSettingsController(req, res, pool) {
  try {
    const data = await getUserStatisticSettingsService(req.user.userId, pool);
    res.json(data);
  } catch (error) {
    console.error('Error fetching user statistic settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateUserStatisticSettingsController(req, res, pool) {
  try {
    const {
      business_hours_start,
      business_hours_end,
      saturday_hours_start,
      saturday_hours_end,
      sunday_hours_start,
      sunday_hours_end,
      statistics_visibility
    } = req.body;

    if (business_hours_start && !isValidTime(business_hours_start)) {
      return res.status(400).json({ error: 'Invalid business_hours_start time format' });
    }
    if (business_hours_end && !isValidTime(business_hours_end)) {
      return res.status(400).json({ error: 'Invalid business_hours_end time format' });
    }
    if (saturday_hours_start && !isValidTime(saturday_hours_start)) {
      return res.status(400).json({ error: 'Invalid saturday_hours_start time format' });
    }
    if (saturday_hours_end && !isValidTime(saturday_hours_end)) {
      return res.status(400).json({ error: 'Invalid saturday_hours_end time format' });
    }
    if (sunday_hours_start && !isValidTime(sunday_hours_start)) {
      return res.status(400).json({ error: 'Invalid sunday_hours_start time format' });
    }
    if (sunday_hours_end && !isValidTime(sunday_hours_end)) {
      return res.status(400).json({ error: 'Invalid sunday_hours_end time format' });
    }

    if (statistics_visibility !== undefined && typeof statistics_visibility !== 'object') {
      return res.status(400).json({ error: 'statistics_visibility must be an object' });
    }

    const data = await updateUserStatisticSettingsService(req.user.userId, req.body, pool);
    res.json(data);
  } catch (error) {
    console.error('Error updating user statistic settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}


