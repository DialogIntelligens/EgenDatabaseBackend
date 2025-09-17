import {
  registerUserService, loginService, updateCompanyInfoService, getCompanyInfoService,
  updateAgentNameService, updateProfilePictureService, uploadLogoService,
  getLivechatNotificationSoundService, updateLivechatNotificationSoundService,
  getShowUserProfilePicturesService, updateShowUserProfilePicturesService,
  trackDashboardOpenService, trackPageVisitService
} from '../services/usersService.js';
import {
  validateRegisterPayload, validateLoginPayload, validateCompanyInfoPayload,
  validateAgentNamePayload, validateProfilePicturePayload, validateUploadLogoPayload
} from '../utils/usersUtils.js';

export async function registerController(req, res, pool) {
  const err = validateRegisterPayload(req.body);
  if (err) return res.status(400).json({ error: err });
  try {
    const out = await registerUserService(req.body, pool);
    res.status(201).json(out);
  } catch (e) {
    res.status(500).json({ error: 'Database error', details: e.message });
  }
}

export async function loginController(req, res, pool, jwtSecret) {
  const err = validateLoginPayload(req.body);
  if (err) return res.status(400).json({ error: err });
  try {
    const out = await loginService(req.body, pool, jwtSecret);
    res.json(out);
  } catch (e) {
    const status = e.message.includes('Invalid') ? 400 : 500;
    res.status(status).json({ error: status === 400 ? e.message : 'Database error', details: status === 500 ? e.message : undefined });
  }
}

export async function updateCompanyInfoController(req, res, pool) {
  const err = validateCompanyInfoPayload(req.body);
  if (err) return res.status(400).json({ error: err });
  try {
    const out = await updateCompanyInfoService(req.user.userId, req.body.company_info, pool);
    res.status(200).json({ message: 'Company information updated successfully', user: out });
  } catch (e) {
    const status = e.message === 'User not found' ? 404 : 500;
    res.status(status).json({ error: status === 404 ? e.message : 'Database error', details: status === 500 ? e.message : undefined });
  }
}

export async function getCompanyInfoController(req, res, pool) {
  try {
    const out = await getCompanyInfoService(req.user.userId, pool);
    res.status(200).json(out);
  } catch (e) {
    const status = e.message === 'User not found' ? 404 : 500;
    res.status(status).json({ error: status === 404 ? e.message : 'Database error', details: status === 500 ? e.message : undefined });
  }
}

export async function updateAgentNameController(req, res, pool) {
  const err = validateAgentNamePayload(req.body);
  if (err) return res.status(400).json({ error: err });
  try {
    const out = await updateAgentNameService(req.user.userId, req.body.agent_name, pool);
    res.status(200).json({ message: 'Agent name updated successfully', user: out });
  } catch (e) {
    const status = e.message === 'User not found' ? 404 : 500;
    res.status(status).json({ error: status === 404 ? e.message : 'Database error', details: status === 500 ? e.message : undefined });
  }
}

export async function updateProfilePictureController(req, res, pool) {
  const err = validateProfilePicturePayload(req.body);
  if (err) return res.status(400).json({ error: err });
  try {
    const out = await updateProfilePictureService(req.user.userId, req.body.profile_picture, pool);
    res.status(200).json({ message: 'Profile picture updated successfully', user: out });
  } catch (e) {
    const status = e.message === 'User not found' ? 404 : 500;
    res.status(status).json({ error: status === 404 ? e.message : 'Database error', details: status === 500 ? e.message : undefined });
  }
}

export async function uploadLogoController(req, res) {
  const err = validateUploadLogoPayload(req.body);
  if (err) return res.status(400).json({ error: err });
  try {
    const out = uploadLogoService(req.body.image);
    res.status(200).json({ message: 'Image uploaded successfully', url: out.url });
  } catch (e) {
    const status = e.message.startsWith('Invalid') || e.message.includes('size') ? 400 : 500;
    res.status(status).json({ error: status === 400 ? e.message : 'Upload failed', details: status === 500 ? e.message : undefined });
  }
}

export async function getLivechatNotificationSoundController(req, res, pool) {
  try {
    const out = await getLivechatNotificationSoundService(req.user.userId, pool);
    res.json(out);
  } catch (e) {
    const status = e.message === 'User not found' ? 404 : 500;
    res.status(status).json({ error: status === 404 ? e.message : 'Database error', details: status === 500 ? e.message : undefined });
  }
}

export async function updateLivechatNotificationSoundController(req, res, pool) {
  if (typeof req.body.livechat_notification_sound !== 'boolean') {
    return res.status(400).json({ error: 'livechat_notification_sound must be a boolean' });
  }
  try {
    const out = await updateLivechatNotificationSoundService(req.user.userId, req.body.livechat_notification_sound, pool);
    res.json({ message: 'Livechat notification sound preference updated successfully', livechat_notification_sound: out.livechat_notification_sound });
  } catch (e) {
    const status = e.message === 'User not found' ? 404 : 500;
    res.status(status).json({ error: status === 404 ? e.message : 'Database error', details: status === 500 ? e.message : undefined });
  }
}

export async function getShowUserProfilePicturesController(req, res, pool) {
  try {
    const out = await getShowUserProfilePicturesService(req.user.userId, pool);
    res.json(out);
  } catch (e) {
    const status = e.message === 'User not found' ? 404 : 500;
    res.status(status).json({ error: status === 404 ? e.message : 'Database error', details: status === 500 ? e.message : undefined });
  }
}

export async function updateShowUserProfilePicturesController(req, res, pool) {
  if (typeof req.body.show_user_profile_pictures !== 'boolean') {
    return res.status(400).json({ error: 'show_user_profile_pictures must be a boolean' });
  }
  try {
    const out = await updateShowUserProfilePicturesService(req.user.userId, req.body.show_user_profile_pictures, pool);
    res.json({ message: 'Show user profile pictures preference updated successfully', show_user_profile_pictures: out.show_user_profile_pictures });
  } catch (e) {
    const status = e.message === 'User not found' ? 404 : 500;
    res.status(status).json({ error: status === 404 ? e.message : 'Database error', details: status === 500 ? e.message : undefined });
  }
}

export async function trackDashboardOpenController(req, res, pool) {
  try {
    const out = await trackDashboardOpenService(req.user.userId, req.body, pool);
    res.status(201).json(out);
  } catch (e) {
    res.status(500).json({ error: 'Database error', details: e.message });
  }
}

export async function trackPageVisitController(req, res, pool) {
  try {
    const out = await trackPageVisitService(req.user.userId, req.body, pool);
    res.status(201).json(out);
  } catch (e) {
    res.status(500).json({ error: 'Database error', details: e.message });
  }
}


