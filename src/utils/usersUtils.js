export function validateRegisterPayload(body) {
  const required = ['username', 'password'];
  for (const key of required) {
    if (!body[key]) return `${key} is required`;
  }
  if (body.chatbot_filepath && !Array.isArray(body.chatbot_filepath)) {
    return 'chatbot_filepath must be an array of strings.';
  }
  return null;
}

export function validateLoginPayload(body) {
  if (!body.username || !body.password) return 'username and password are required';
  return null;
}

export function validateCompanyInfoPayload(body) {
  if (body.company_info === undefined) return 'company_info field is required';
  return null;
}

export function validateAgentNamePayload(body) {
  if (!body.agent_name || typeof body.agent_name !== 'string' || body.agent_name.trim() === '') {
    return 'agent_name is required and must be a non-empty string';
  }
  return null;
}

export function validateProfilePicturePayload(body) {
  if (!body.profile_picture || typeof body.profile_picture !== 'string' || body.profile_picture.trim() === '') {
    return 'profile_picture is required and must be a non-empty string';
  }
  return null;
}

export function validateUploadLogoPayload(body) {
  if (!body.image || typeof body.image !== 'string') return 'image (base64 data URL) is required';
  return null;
}

export function sanitizePineconeIndexes(indexes) {
  if (!Array.isArray(indexes)) return [];
  return indexes.map(index => ({
    namespace: index?.namespace,
    index_name: index?.index_name,
    has_api_key: !!index?.API_key,
    group: index?.group
  }));
}

export function parseTargetUserIdFromQuery(query, requestingUser) {
  const isAdmin = requestingUser?.isAdmin === true;
  if (isAdmin && query?.userId) {
    const n = parseInt(query.userId);
    return Number.isNaN(n) ? requestingUser.userId : n;
  }
  return requestingUser.userId;
}


