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


