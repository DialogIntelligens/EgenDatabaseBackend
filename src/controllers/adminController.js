import {
  deleteUserService,
  getUsersService,
  getUserByIdService,
  updateUserService,
  resetPasswordService,
  archiveUserService,
  getArchivedUsersService,
  updateCompanyInfoService,
  getConversationUpdateJobsService,
  cancelConversationUpdateJobService,
  getErrorLogsService,
  getErrorStatisticsService,
  getRevenueAnalyticsService,
  getMonthlyConversationBreakdownService,
  getUserTrackingStatsService,
  updateUserPineconeApiKeyService,
  updateUserIndexesService
} from '../services/adminService.js';
import {
  validateUserUpdatePayload,
  validatePasswordResetPayload,
  validateArchivePayload,
  validateCompanyInfoPayload,
  validatePineconeApiKeyPayload,
  validateUserIndexesPayload,
  hasAdminAccess,
  hasFullAdminAccess
} from '../utils/adminUtils.js';

export async function deleteUserController(req, res, pool, getPineconeApiKeyForIndex) {
  const userId = req.params.id;
  if (!hasAdminAccess(req.user)) return res.status(403).json({ error: 'Forbidden: Admins only' });
  try {
    const deletedUser = await deleteUserService(userId, pool, getPineconeApiKeyForIndex);
    res.status(200).json({ message: 'User deleted successfully', username: deletedUser.username });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    console.error('Error deleting user:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
}

export async function getUsersController(req, res, pool) {
  if (!hasAdminAccess(req.user)) return res.status(403).json({ error: 'Forbidden: Admins only' });
  try {
    const users = await getUsersService(req.user, req.query.include_archived, pool);
    res.json(users);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
}

export async function getUserByIdController(req, res, pool) {
  const userId = req.params.id;
  if (!hasAdminAccess(req.user, userId)) return res.status(403).json({ error: 'Forbidden: You do not have access to this user' });
  try {
    const user = await getUserByIdService(userId, pool);
    res.json(user);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    console.error('Error fetching user details:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
}

export async function updateUserController(req, res, pool) {
  const userId = parseInt(req.params.id);
  if (!hasAdminAccess(req.user, userId)) return res.status(403).json({ error: 'Forbidden: You do not have permission to modify this user' });
  const validation = validateUserUpdatePayload(req.body);
  if (validation) return res.status(400).json({ error: validation });
  try {
    const updatedUser = await updateUserService(userId, req.body, pool);
    res.status(200).json({ message: 'User updated successfully', user: updatedUser });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    console.error('Error updating user:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
}

export async function resetPasswordController(req, res, pool) {
  const userId = parseInt(req.params.id);
  if (!hasAdminAccess(req.user, userId)) return res.status(403).json({ error: 'Forbidden: You do not have permission to reset this user\'s password' });
  const validation = validatePasswordResetPayload(req.body);
  if (validation) return res.status(400).json({ error: validation });
  try {
    const user = await resetPasswordService(userId, req.body.newPassword, pool);
    res.status(200).json({ message: 'Password reset successfully', user });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    console.error('Error resetting password:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
}

export async function archiveUserController(req, res, pool) {
  const userId = parseInt(req.params.id);
  if (!hasAdminAccess(req.user, userId)) return res.status(403).json({ error: 'Forbidden: You do not have permission to archive this user' });
  const validation = validateArchivePayload(req.body);
  if (validation) return res.status(400).json({ error: validation });
  try {
    const user = await archiveUserService(userId, req.body.archived, pool);
    res.status(200).json({ message: `User ${req.body.archived ? 'archived' : 'unarchived'} successfully`, user });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    console.error('Error archiving/unarchiving user:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
}

export async function getArchivedUsersController(req, res, pool) {
  if (!hasAdminAccess(req.user)) return res.status(403).json({ error: 'Forbidden: Admins only' });
  try {
    const users = await getArchivedUsersService(req.user, pool);
    res.json(users);
  } catch (err) {
    console.error('Error fetching archived users:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
}

export async function updateCompanyInfoController(req, res, pool) {
  const userId = req.params.userId;
  if (!hasFullAdminAccess(req.user)) return res.status(403).json({ error: 'Forbidden: Admins only' });
  const validation = validateCompanyInfoPayload(req.body);
  if (validation) return res.status(400).json({ error: validation });
  try {
    const user = await updateCompanyInfoService(userId, req.body.company_info, pool);
    res.status(200).json({ message: 'Company information updated successfully', user });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    console.error('Error updating company information:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
}

export async function getConversationUpdateJobsController(req, res, pool) {
  if (!hasFullAdminAccess(req.user)) return res.status(403).json({ error: 'Forbidden: Admins only' });
  try {
    const jobs = await getConversationUpdateJobsService(pool);
    res.json(jobs);
  } catch (err) {
    console.error('Error fetching jobs:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
}

export async function cancelConversationUpdateJobController(req, res, pool) {
  const { jobId } = req.params;
  if (!hasFullAdminAccess(req.user)) return res.status(403).json({ error: 'Forbidden: Admins only' });
  try {
    const job = await cancelConversationUpdateJobService(jobId, pool);
    res.json({ message: 'Job cancelled successfully', job });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    console.error('Error cancelling job:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
}

export async function getErrorLogsController(req, res, pool) {
  if (!hasFullAdminAccess(req.user)) return res.status(403).json({ error: 'Forbidden: Admins only' });
  try {
    const logs = await getErrorLogsService(req.query, pool);
    res.json(logs);
  } catch (err) {
    console.error('Error fetching error logs:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
}

export async function getErrorStatisticsController(req, res, pool) {
  if (!hasFullAdminAccess(req.user)) return res.status(403).json({ error: 'Forbidden: Admins only' });
  try {
    const stats = await getErrorStatisticsService(req.query, pool);
    res.json(stats);
  } catch (err) {
    console.error('Error fetching error statistics:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
}

// Admin Extensions
export async function getRevenueAnalyticsController(req, res, pool) {
  if (!hasFullAdminAccess(req.user)) return res.status(403).json({ error: 'Forbidden: Admin access required' });
  try {
    const result = await getRevenueAnalyticsService(pool);
    res.json(result);
  } catch (err) {
    console.error('Error fetching revenue analytics:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
}

export async function getMonthlyConversationBreakdownController(req, res, pool) {
  if (!hasFullAdminAccess(req.user)) return res.status(403).json({ error: 'Forbidden: Admin access required' });
  try {
    const result = await getMonthlyConversationBreakdownService(pool);
    res.json(result);
  } catch (err) {
    console.error('Error fetching monthly conversation breakdown:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
}

export async function getUserTrackingStatsController(req, res, pool) {
  if (!hasFullAdminAccess(req.user)) return res.status(403).json({ error: 'Forbidden: Admin access required' });
  try {
    const result = await getUserTrackingStatsService(pool);
    res.json(result);
  } catch (err) {
    console.error('Error fetching user tracking stats:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
}

export async function updateUserPineconeApiKeyController(req, res, pool) {
  const targetId = parseInt(req.params.id);
  if (!(req.user.isAdmin || (req.user.isLimitedAdmin && (req.user.accessibleUserIds || []).includes(targetId)))) {
    return res.status(403).json({ error: 'Forbidden: You do not have permission to modify this user\'s Pinecone API key' });
  }

  const validation = validatePineconeApiKeyPayload(req.body);
  if (validation) return res.status(400).json({ error: validation });

  try {
    const result = await updateUserPineconeApiKeyService(targetId, req.body.pinecone_api_key, pool);
    res.status(200).json({
      message: 'Pinecone API key updated successfully',
      user: result
    });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    console.error('Error updating Pinecone API key:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
}

export async function updateUserIndexesController(req, res, pool) {
  const targetId = parseInt(req.params.id);
  if (!(req.user.isAdmin || (req.user.isLimitedAdmin && (req.user.accessibleUserIds || []).includes(targetId)))) {
    return res.status(403).json({ error: 'Forbidden: You do not have permission to modify this user\'s Pinecone indexes' });
  }

  const validation = validateUserIndexesPayload(req.body);
  if (validation) return res.status(400).json({ error: validation });

  try {
    const result = await updateUserIndexesService(targetId, req.body.pinecone_indexes, pool);
    res.status(200).json({
      message: 'Pinecone indexes updated successfully',
      user: result
    });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    console.error('Error updating user indexes:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
}


