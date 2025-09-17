import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export async function registerUserService(body, pool) {
  const {
    username, password, chatbot_ids, pinecone_api_key, pinecone_indexes,
    chatbot_filepath, is_admin, is_limited_admin, accessible_chatbot_ids, accessible_user_ids
  } = body;

  const hashed = await bcrypt.hash(password, 10);
  const pineconeIndexesJSON = JSON.stringify(pinecone_indexes);

  await pool.query(
    `INSERT INTO users (
       username, password, chatbot_ids, pinecone_api_key, pinecone_indexes,
       chatbot_filepath, is_admin, is_limited_admin, accessible_chatbot_ids, accessible_user_ids
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      username,
      hashed,
      chatbot_ids,
      pinecone_api_key,
      pineconeIndexesJSON,
      chatbot_filepath || [],
      is_admin,
      is_limited_admin,
      accessible_chatbot_ids || [],
      accessible_user_ids || []
    ]
  );
  return { message: 'User registered successfully' };
}

export async function loginService({ username, password }, pool, jwtSecret) {
  const q = await pool.query('SELECT *, agent_name, profile_picture FROM users WHERE username = $1', [username]);
  if (q.rows.length === 0) throw new Error('Invalid username or password');

  const user = q.rows[0];
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) throw new Error('Invalid username or password');

  const tokenPayload = {
    userId: user.id,
    isAdmin: user.is_admin,
    isLimitedAdmin: user.is_limited_admin,
    accessibleChatbotIds: user.accessible_chatbot_ids || [],
    accessibleUserIds: user.accessible_user_ids || []
  };
  const token = jwt.sign(tokenPayload, jwtSecret, { expiresIn: '24h' });

  let chatbotIds = user.chatbot_ids || [];
  if (typeof chatbotIds === 'string') {
    try { chatbotIds = JSON.parse(chatbotIds); } catch { chatbotIds = []; }
  }

  if (user.is_admin) {
    const allUsers = await pool.query('SELECT chatbot_ids FROM users');
    let merged = [];
    for (const row of allUsers.rows) {
      let ids = row.chatbot_ids || [];
      if (typeof ids === 'string') { try { ids = JSON.parse(ids); } catch { ids = []; } }
      merged = merged.concat(ids);
    }
    chatbotIds = [...new Set(merged)];
  } else if (user.is_limited_admin) {
    chatbotIds = user.accessible_chatbot_ids || [];
  }

  return {
    token,
    chatbot_ids: chatbotIds,
    chatbot_filepath: user.chatbot_filepath || [],
    is_admin: user.is_admin,
    is_limited_admin: user.is_limited_admin,
    accessible_chatbot_ids: user.accessible_chatbot_ids || [],
    accessible_user_ids: user.accessible_user_ids || [],
    thumbs_rating: user.thumbs_rating || false,
    company_info: user.company_info || '',
    livechat: user.livechat || false,
    split_test_enabled: user.split_test_enabled || false,
    agent_name: user.agent_name || 'Support Agent',
    profile_picture: user.profile_picture || ''
  };
}

export async function updateCompanyInfoService(userId, company_info, pool) {
  const r = await pool.query(
    'UPDATE users SET company_info = $1 WHERE id = $2 RETURNING id, username, company_info',
    [company_info, userId]
  );
  if (r.rows.length === 0) throw new Error('User not found');
  return r.rows[0];
}

export async function getCompanyInfoService(userId, pool) {
  const r = await pool.query('SELECT company_info FROM users WHERE id = $1', [userId]);
  if (r.rows.length === 0) throw new Error('User not found');
  return { company_info: r.rows[0].company_info || '' };
}

export async function updateAgentNameService(userId, agent_name, pool) {
  const r = await pool.query(
    'UPDATE users SET agent_name = $1 WHERE id = $2 RETURNING id, username, agent_name',
    [agent_name.trim(), userId]
  );
  if (r.rows.length === 0) throw new Error('User not found');
  return r.rows[0];
}

export async function updateProfilePictureService(userId, profile_picture, pool) {
  const r = await pool.query(
    'UPDATE users SET profile_picture = $1 WHERE id = $2 RETURNING id, username, profile_picture',
    [profile_picture.trim(), userId]
  );
  if (r.rows.length === 0) throw new Error('User not found');
  return r.rows[0];
}

export function uploadLogoService(image) {
  if (!image.startsWith('data:')) throw new Error('Image must be base64 encoded with data URL format');
  const matches = image.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) throw new Error('Invalid base64 image format');
  const mimeType = matches[1];
  const data = matches[2];

  const allowed = ['image/jpeg','image/jpg','image/png','image/gif','image/webp'];
  if (!allowed.includes(mimeType)) throw new Error('Invalid file type. Allowed types: JPEG, PNG, GIF, WebP');

  const sizeInBytes = (data.length * 3) / 4;
  if (sizeInBytes > 5 * 1024 * 1024) throw new Error('File size too large. Maximum 5MB allowed.');

  return { url: `data:${mimeType};base64,${data}` };
}

export async function getLivechatNotificationSoundService(userId, pool) {
  const r = await pool.query('SELECT livechat_notification_sound FROM users WHERE id = $1', [userId]);
  if (r.rows.length === 0) throw new Error('User not found');
  return { livechat_notification_sound: r.rows[0].livechat_notification_sound !== false };
}

export async function updateLivechatNotificationSoundService(userId, value, pool) {
  const r = await pool.query(
    'UPDATE users SET livechat_notification_sound = $2 WHERE id = $1 RETURNING livechat_notification_sound',
    [userId, value]
  );
  if (r.rows.length === 0) throw new Error('User not found');
  return { livechat_notification_sound: r.rows[0].livechat_notification_sound };
}

export async function getShowUserProfilePicturesService(userId, pool) {
  const r = await pool.query('SELECT show_user_profile_pictures FROM users WHERE id = $1', [userId]);
  if (r.rows.length === 0) throw new Error('User not found');
  return { show_user_profile_pictures: r.rows[0].show_user_profile_pictures !== false };
}

export async function updateShowUserProfilePicturesService(userId, value, pool) {
  const r = await pool.query(
    'UPDATE users SET show_user_profile_pictures = $2 WHERE id = $1 RETURNING show_user_profile_pictures',
    [userId, value]
  );
  if (r.rows.length === 0) throw new Error('User not found');
  return { show_user_profile_pictures: r.rows[0].show_user_profile_pictures };
}

export async function trackDashboardOpenService(userId, { session_id, ip_address, user_agent }, pool) {
  await pool.query(
    `INSERT INTO user_dashboard_opens (user_id, session_id, ip_address, user_agent)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, session_id, DATE(opened_at)) DO NOTHING`,
    [userId, session_id, ip_address, user_agent]
  );
  return { message: 'Dashboard open tracked successfully' };
}

export async function trackPageVisitService(userId, { page_name, session_id, duration, ip_address, user_agent }, pool) {
  await pool.query(
    `INSERT INTO user_page_visits (user_id, page_name, session_id, duration, ip_address, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [userId, page_name, session_id, duration, ip_address, user_agent]
  );
  return { message: 'Page visit tracked successfully' };
}


