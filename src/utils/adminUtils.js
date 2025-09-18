export function validateUserUpdatePayload({ chatbot_ids, chatbot_filepath, monthly_payment }) {
  if ((!chatbot_ids || !Array.isArray(chatbot_ids)) && 
      (!chatbot_filepath || !Array.isArray(chatbot_filepath)) &&
      (monthly_payment === undefined)) {
    return 'At least one of chatbot_ids, chatbot_filepath, or monthly_payment must be provided.';
  }
  return null;
}

export function validatePasswordResetPayload({ newPassword }) {
  if (!newPassword || newPassword.trim() === '') {
    return 'New password is required';
  }
  return null;
}

export function validateArchivePayload({ archived }) {
  if (typeof archived !== 'boolean') {
    return 'archived field is required and must be a boolean';
  }
  return null;
}

export function validateCompanyInfoPayload({ company_info }) {
  if (company_info === undefined) {
    return 'company_info field is required';
  }
  return null;
}

export function hasAdminAccess(user, targetId = null) {
  if (user.isAdmin) return true;
  if (user.isLimitedAdmin && targetId) {
    return (user.accessibleUserIds || []).includes(parseInt(targetId));
  }
  return user.isLimitedAdmin && !targetId;
}

export function hasFullAdminAccess(user) {
  return user.isAdmin === true;
}

export function validatePineconeApiKeyPayload({ pinecone_api_key }) {
  if (!pinecone_api_key || typeof pinecone_api_key !== 'string' || pinecone_api_key.trim() === '') {
    return 'pinecone_api_key is required and must be a non-empty string';
  }
  return null;
}

export function validateUserIndexesPayload({ pinecone_indexes }) {
  if (!Array.isArray(pinecone_indexes)) {
    return 'pinecone_indexes must be an array';
  }

  for (const index of pinecone_indexes) {
    if (!index.namespace || !index.index_name) {
      return 'Each index must have namespace and index_name properties';
    }
  }
  return null;
}


